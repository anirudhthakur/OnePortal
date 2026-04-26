package com.anirudh.testmanagement.oneportal.service;

import com.anirudh.testmanagement.oneportal.dto.TestDesignDTO;
import com.anirudh.testmanagement.oneportal.entity.*;
import com.anirudh.testmanagement.oneportal.entity.ProjectMember.ProjectRole;
import com.anirudh.testmanagement.oneportal.entity.TestDesignRow.RowStatus;
import com.anirudh.testmanagement.oneportal.exception.ResourceNotFoundException;
import com.anirudh.testmanagement.oneportal.repository.*;
import org.springframework.security.access.AccessDeniedException;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.poi.ss.usermodel.*;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.time.format.DateTimeFormatter;
import java.time.LocalDate;
import java.util.*;

@Service
@RequiredArgsConstructor
@Slf4j
@Transactional(readOnly = true)
public class ExcelImportService {

    private final TestDesignSheetRepository sheetRepository;
    private final TestDesignRowRepository rowRepository;
    private final UserRepository userRepository;
    private final ProjectRepository projectRepository;
    private final ProjectMemberRepository projectMemberRepository;
    private final DefectRowRepository defectRowRepository;
    private final ObjectMapper objectMapper;

    private static final DateTimeFormatter DATE_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd");

    @Transactional
    public TestDesignDTO.UploadResponse importExcel(MultipartFile file, Long uploaderId, Long projectId) {
        return doImport(file, uploaderId, projectId, false);
    }

    @Transactional
    public TestDesignDTO.UploadResponse replaceSheet(MultipartFile file, Long uploaderId, Long projectId) {
        if (projectId == null) throw new IllegalArgumentException("projectId is required for replace");
        sheetRepository.findByProjectId(projectId).ifPresent(existing -> {
            rowRepository.deleteLinkedDefectsBySheetId(existing.getId());
            rowRepository.deleteBySheetId(existing.getId());
            sheetRepository.delete(existing);
        });
        return doImport(file, uploaderId, projectId, true);
    }

    private TestDesignDTO.UploadResponse doImport(MultipartFile file, Long uploaderId,
                                                   Long projectId, boolean smartMapping) {
        User uploader = uploaderId != null
                ? userRepository.findById(uploaderId).orElse(null)
                : null;
        Project project = projectId != null
                ? projectRepository.findById(projectId)
                        .orElseThrow(() -> new ResourceNotFoundException("Project", projectId))
                : null;

        try (Workbook workbook = WorkbookFactory.create(file.getInputStream())) {
            Sheet sheet = workbook.getSheetAt(0);
            String sheetTabName = sheet.getSheetName();

            Row headerRow = sheet.getRow(0);
            if (headerRow == null) {
                throw new IllegalArgumentException("Excel file has no header row");
            }
            List<String> columns = new ArrayList<>();
            for (int c = 0; c < headerRow.getLastCellNum(); c++) {
                Cell cell = headerRow.getCell(c, Row.MissingCellPolicy.CREATE_NULL_AS_BLANK);
                String header = cell.getStringCellValue().trim();
                columns.add(header.isEmpty() ? "Column_" + (c + 1) : header);
            }

            // Identify smart-mapping columns
            int statusColIdx = -1;
            int assignedToColIdx = -1;
            if (smartMapping) {
                for (int i = 0; i < columns.size(); i++) {
                    String col = columns.get(i).trim().toLowerCase();
                    if (col.equals("status")) {
                        statusColIdx = i;
                    } else if (col.equals("assigned to") || col.equals("assigned_to")
                            || col.equals("assignedto")) {
                        assignedToColIdx = i;
                    }
                }
            }

            // Build defect lookup: defectId string -> DefectRow PK (runs for any project-linked import)
            Map<String, Long> defectLookup = new HashMap<>();
            int defectColIdx = -1;
            if (projectId != null) {
                defectRowRepository.findAllByProjectId(projectId)
                        .forEach(dr -> defectLookup.put(dr.getDefectId().trim(), dr.getId()));
                log.info("[defect-link] project={} defectLookup size={} keys={}",
                        projectId, defectLookup.size(),
                        defectLookup.size() <= 30 ? defectLookup.keySet() : "(too many to print)");
                // First pass: prefer explicit "linked defects" / "linked defect" column
                for (int i = 0; i < columns.size(); i++) {
                    String col = columns.get(i).trim().toLowerCase();
                    if (col.equals("linked defects") || col.equals("linked defect")) {
                        defectColIdx = i;
                        break;
                    }
                }
                // Second pass: fall back to generic "defects" / "defect" / "defect id"
                if (defectColIdx < 0) {
                    for (int i = 0; i < columns.size(); i++) {
                        String col = columns.get(i).trim().toLowerCase();
                        if (col.equals("defects") || col.equals("defect")
                                || col.equals("defect id") || col.equals("defect ids")) {
                            defectColIdx = i;
                            break;
                        }
                    }
                }
                log.info("[defect-link] columns={} defectColIdx={} detectedColName={}",
                        columns, defectColIdx,
                        defectColIdx >= 0 ? columns.get(defectColIdx) : "NONE");
            }

            TestDesignSheet designSheet = TestDesignSheet.builder()
                    .fileName(file.getOriginalFilename())
                    .sheetName(sheetTabName)
                    .uploadedBy(uploader)
                    .project(project)
                    .build();
            designSheet = sheetRepository.save(designSheet);

            FormulaEvaluator evaluator = workbook.getCreationHelper().createFormulaEvaluator();
            int importedRows = 0;

            for (int r = 1; r <= sheet.getLastRowNum(); r++) {
                Row row = sheet.getRow(r);
                if (row == null || isRowBlank(row)) continue;

                Map<String, String> rowMap = new LinkedHashMap<>();
                for (int c = 0; c < columns.size(); c++) {
                    Cell cell = row.getCell(c, Row.MissingCellPolicy.CREATE_NULL_AS_BLANK);
                    rowMap.put(columns.get(c), cellToString(cell, evaluator));
                }

                RowStatus rowStatus = RowStatus.NOT_STARTED;
                User assignedTo = null;

                if (smartMapping) {
                    if (statusColIdx >= 0) {
                        String statusVal = rowMap.getOrDefault(columns.get(statusColIdx), "");
                        RowStatus parsed = parseStatusValue(statusVal);
                        if (parsed != null) rowStatus = parsed;
                    }
                    if (assignedToColIdx >= 0) {
                        String username = rowMap.getOrDefault(columns.get(assignedToColIdx), "").trim();
                        if (!username.isEmpty()) {
                            assignedTo = userRepository.findByUsername(username).orElse(null);
                        }
                    }
                }

                Set<Long> linkedIds = new HashSet<>();
                if (defectColIdx >= 0 && !defectLookup.isEmpty()) {
                    String raw = rowMap.getOrDefault(columns.get(defectColIdx), "");
                    if (!raw.isBlank()) {
                        if (importedRows < 5) {
                            log.info("[defect-link] row={} raw='{}' tokens={}",
                                    importedRows + 1, raw,
                                    Arrays.asList(raw.split("[,;]")));
                        }
                        Arrays.stream(raw.split("[,;]"))
                                .map(String::trim)
                                .map(s -> s.replaceAll("(?i)^[a-z#]+", "")) // strip prefix e.g. "D#"
                                .filter(s -> !s.isEmpty())
                                .map(defectLookup::get)
                                .filter(Objects::nonNull)
                                .forEach(linkedIds::add);
                    }
                }

                TestDesignRow designRow = TestDesignRow.builder()
                        .sheet(designSheet)
                        .rowIndex(importedRows + 1)
                        .rowData(objectMapper.writeValueAsString(rowMap))
                        .rowStatus(rowStatus)
                        .assignedTo(assignedTo)
                        .linkedDefectIds(linkedIds)
                        .build();
                rowRepository.save(designRow);
                importedRows++;
            }

            log.info("Imported {} rows from file '{}', sheet '{}' (smartMapping={})",
                    importedRows, file.getOriginalFilename(), sheetTabName, smartMapping);

            return TestDesignDTO.UploadResponse.builder()
                    .sheetId(designSheet.getId())
                    .fileName(designSheet.getFileName())
                    .sheetName(sheetTabName)
                    .totalRows(importedRows)
                    .columns(columns)
                    .build();

        } catch (IOException e) {
            throw new IllegalArgumentException("Failed to read Excel file: " + e.getMessage(), e);
        }
    }

    public Page<TestDesignDTO.SheetSummary> getAllSheets(Pageable pageable) {
        return sheetRepository.findAllByOrderByCreatedAtDesc(pageable).map(s ->
                TestDesignDTO.SheetSummary.builder()
                        .sheetId(s.getId())
                        .fileName(s.getFileName())
                        .sheetName(s.getSheetName())
                        .totalRows(sheetRepository.countRowsBySheetId(s.getId()))
                        .createdAt(s.getCreatedAt())
                        .uploadedByUsername(s.getUploadedBy() != null ? s.getUploadedBy().getUsername() : null)
                        .projectId(s.getProject() != null ? s.getProject().getId() : null)
                        .build()
        );
    }

    public TestDesignDTO.SheetDataResponse getSheetData(Long sheetId) {
        TestDesignSheet sheet = sheetRepository.findById(sheetId)
                .orElseThrow(() -> new ResourceNotFoundException("TestDesignSheet", sheetId));

        List<TestDesignRow> dbRows = rowRepository.findBySheetIdOrderByRowIndex(sheetId);
        List<Map<String, String>> rows = new ArrayList<>();
        List<String> columns = new ArrayList<>();

        for (TestDesignRow dbRow : dbRows) {
            try {
                Map<String, String> map = objectMapper.readValue(
                        dbRow.getRowData(), new TypeReference<LinkedHashMap<String, String>>() {});
                if (columns.isEmpty()) {
                    columns.addAll(map.keySet());
                }
                rows.add(map);
            } catch (IOException e) {
                log.warn("Could not deserialize rowData for row id {}: {}", dbRow.getId(), e.getMessage());
            }
        }

        return TestDesignDTO.SheetDataResponse.builder()
                .sheetId(sheet.getId())
                .fileName(sheet.getFileName())
                .sheetName(sheet.getSheetName())
                .columns(columns)
                .rows(rows)
                .build();
    }

    public TestDesignDTO.ProjectSheetDataResponse getProjectSheetData(Long projectId) {
        TestDesignSheet sheet = sheetRepository.findByProjectId(projectId)
                .orElseThrow(() -> new ResourceNotFoundException("TestDesignSheet for project", projectId));

        List<TestDesignRow> dbRows = rowRepository.findBySheetIdOrderByRowIndex(sheet.getId());
        List<TestDesignDTO.RowWithMeta> rows = new ArrayList<>();
        List<String> columns = new ArrayList<>();

        for (TestDesignRow dbRow : dbRows) {
            try {
                Map<String, String> map = objectMapper.readValue(
                        dbRow.getRowData(), new TypeReference<LinkedHashMap<String, String>>() {});
                if (columns.isEmpty()) {
                    columns.addAll(map.keySet());
                }
                rows.add(TestDesignDTO.RowWithMeta.builder()
                        .rowId(dbRow.getId())
                        .rowIndex(dbRow.getRowIndex())
                        .assignedToId(dbRow.getAssignedTo() != null ? dbRow.getAssignedTo().getId() : null)
                        .assignedToUsername(dbRow.getAssignedTo() != null
                                ? (dbRow.getAssignedTo().isDeleted()
                                        ? dbRow.getAssignedTo().getUsername() + " (INACTIVE)"
                                        : dbRow.getAssignedTo().getUsername())
                                : null)
                        .rowStatus(dbRow.getRowStatus())
                        .data(map)
                        .linkedDefectIds(new HashSet<>(dbRow.getLinkedDefectIds()))
                        .updatedAt(dbRow.getUpdatedAt())
                        .updatedByUsername(dbRow.getUpdatedBy() != null ? dbRow.getUpdatedBy().getUsername() : null)
                        .build());
            } catch (IOException e) {
                log.warn("Could not deserialize rowData for row id {}: {}", dbRow.getId(), e.getMessage());
            }
        }

        return TestDesignDTO.ProjectSheetDataResponse.builder()
                .sheetId(sheet.getId())
                .fileName(sheet.getFileName())
                .sheetName(sheet.getSheetName())
                .projectId(projectId)
                .columns(columns)
                .rows(rows)
                .build();
    }

    @Transactional
    public TestDesignDTO.RowWithMeta updateRow(Long sheetId, Long rowId, Long requesterId,
                                               TestDesignDTO.UpdateRowRequest request) {
        TestDesignSheet sheet = sheetRepository.findById(sheetId)
                .orElseThrow(() -> new ResourceNotFoundException("TestDesignSheet", sheetId));
        TestDesignRow row = rowRepository.findById(rowId)
                .orElseThrow(() -> new ResourceNotFoundException("TestDesignRow", rowId));

        if (!row.getSheet().getId().equals(sheetId)) {
            throw new IllegalArgumentException("Row does not belong to this sheet");
        }
        if (sheet.getProject() == null) {
            throw new IllegalArgumentException("Sheet is not linked to a project");
        }

        Long projectId = sheet.getProject().getId();
        ProjectMember requester = projectMemberRepository.findByProjectIdAndUserId(projectId, requesterId)
                .orElseThrow(() -> new AccessDeniedException("You are not a member of this project"));

        boolean updatingAssignment = request.getAssignedToId() != null;
        if (updatingAssignment && requester.getRole() != ProjectRole.OWNER) {
            throw new AccessDeniedException("Only OWNER can change assignment");
        }
        if (requester.getRole() == ProjectRole.VIEWER) {
            throw new AccessDeniedException("VIEWERs cannot edit rows");
        }

        if (updatingAssignment) {
            User assignee = userRepository.findById(request.getAssignedToId())
                    .orElseThrow(() -> new ResourceNotFoundException("User", request.getAssignedToId()));
            row.setAssignedTo(assignee);
        }
        if (request.getRowStatus() != null) {
            row.setRowStatus(request.getRowStatus());
        }
        if (request.getRowData() != null && !request.getRowData().isEmpty()) {
            try {
                row.setRowData(objectMapper.writeValueAsString(request.getRowData()));
            } catch (JsonProcessingException e) {
                throw new IllegalStateException("Could not serialize row data");
            }
        }
        if (request.getLinkedDefectIds() != null) {
            row.getLinkedDefectIds().clear();
            row.getLinkedDefectIds().addAll(request.getLinkedDefectIds());
        }

        User updater = userRepository.findById(requesterId).orElse(null);
        row.setUpdatedAt(java.time.LocalDateTime.now());
        row.setUpdatedBy(updater);

        row = rowRepository.save(row);

        try {
            Map<String, String> map = objectMapper.readValue(
                    row.getRowData(), new TypeReference<LinkedHashMap<String, String>>() {});
            return TestDesignDTO.RowWithMeta.builder()
                    .rowId(row.getId())
                    .rowIndex(row.getRowIndex())
                    .assignedToId(row.getAssignedTo() != null ? row.getAssignedTo().getId() : null)
                    .assignedToUsername(row.getAssignedTo() != null
                            ? (row.getAssignedTo().isDeleted()
                                    ? row.getAssignedTo().getUsername() + " (INACTIVE)"
                                    : row.getAssignedTo().getUsername())
                            : null)
                    .rowStatus(row.getRowStatus())
                    .data(map)
                    .linkedDefectIds(new HashSet<>(row.getLinkedDefectIds()))
                    .updatedAt(row.getUpdatedAt())
                    .updatedByUsername(row.getUpdatedBy() != null ? row.getUpdatedBy().getUsername() : null)
                    .build();
        } catch (IOException e) {
            throw new IllegalStateException("Could not serialize row data");
        }
    }

    @Transactional
    public TestDesignDTO.RowWithMeta addRow(Long sheetId, Long requesterId) {
        TestDesignSheet sheet = sheetRepository.findById(sheetId)
                .orElseThrow(() -> new ResourceNotFoundException("TestDesignSheet", sheetId));
        if (sheet.getProject() == null) {
            throw new IllegalArgumentException("Sheet is not linked to a project");
        }

        Long projectId = sheet.getProject().getId();
        ProjectMember requester = projectMemberRepository.findByProjectIdAndUserId(projectId, requesterId)
                .orElseThrow(() -> new AccessDeniedException("You are not a member of this project"));
        if (requester.getRole() == ProjectRole.VIEWER) {
            throw new AccessDeniedException("VIEWERs cannot add rows");
        }

        List<TestDesignRow> existingRows = rowRepository.findBySheetIdOrderByRowIndex(sheetId);
        Map<String, String> blankMap = new LinkedHashMap<>();
        if (!existingRows.isEmpty()) {
            try {
                Map<String, String> first = objectMapper.readValue(
                        existingRows.get(0).getRowData(), new TypeReference<LinkedHashMap<String, String>>() {});
                first.keySet().forEach(k -> blankMap.put(k, ""));
            } catch (IOException e) {
                log.warn("Could not read first row to determine columns: {}", e.getMessage());
            }
        }

        int nextIndex = existingRows.stream().mapToInt(TestDesignRow::getRowIndex).max().orElse(0) + 1;

        try {
            TestDesignRow newRow = TestDesignRow.builder()
                    .sheet(sheet)
                    .rowIndex(nextIndex)
                    .rowData(objectMapper.writeValueAsString(blankMap))
                    .rowStatus(RowStatus.NOT_STARTED)
                    .updatedAt(java.time.LocalDateTime.now())
                    .updatedBy(userRepository.findById(requesterId).orElse(null))
                    .build();
            newRow = rowRepository.save(newRow);
            return TestDesignDTO.RowWithMeta.builder()
                    .rowId(newRow.getId())
                    .rowIndex(newRow.getRowIndex())
                    .assignedToId(null)
                    .assignedToUsername(null)
                    .rowStatus(RowStatus.NOT_STARTED)
                    .data(blankMap)
                    .linkedDefectIds(new HashSet<>())
                    .updatedAt(newRow.getUpdatedAt())
                    .updatedByUsername(newRow.getUpdatedBy() != null ? newRow.getUpdatedBy().getUsername() : null)
                    .build();
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Could not serialize row data");
        }
    }

    @Transactional
    public void deleteRow(Long sheetId, Long rowId, Long requesterId) {
        TestDesignSheet sheet = sheetRepository.findById(sheetId)
                .orElseThrow(() -> new ResourceNotFoundException("TestDesignSheet", sheetId));
        TestDesignRow row = rowRepository.findById(rowId)
                .orElseThrow(() -> new ResourceNotFoundException("TestDesignRow", rowId));

        if (!row.getSheet().getId().equals(sheetId)) {
            throw new IllegalArgumentException("Row does not belong to this sheet");
        }
        if (sheet.getProject() == null) {
            throw new IllegalArgumentException("Sheet is not linked to a project");
        }

        Long projectId = sheet.getProject().getId();
        ProjectMember requester = projectMemberRepository.findByProjectIdAndUserId(projectId, requesterId)
                .orElseThrow(() -> new AccessDeniedException("You are not a member of this project"));
        if (requester.getRole() == ProjectRole.VIEWER) {
            throw new AccessDeniedException("VIEWERs cannot delete rows");
        }

        rowRepository.delete(row);
    }

    @Transactional
    public void deleteSheet(Long sheetId) {
        TestDesignSheet sheet = sheetRepository.findById(sheetId)
                .orElseThrow(() -> new ResourceNotFoundException("TestDesignSheet", sheetId));
        rowRepository.deleteLinkedDefectsBySheetId(sheetId);
        rowRepository.deleteBySheetId(sheetId);
        sheetRepository.delete(sheet);
    }

    // --- helpers ---

    private RowStatus parseStatusValue(String value) {
        if (value == null || value.isBlank()) return null;
        String normalized = value.trim().toLowerCase().replaceAll("[^a-z]", "");
        return switch (normalized) {
            case "passed", "pass" -> RowStatus.PASSED;
            case "failed", "fail" -> RowStatus.FAILED;
            case "blocked", "block" -> RowStatus.BLOCKED;
            case "inprogress" -> RowStatus.IN_PROGRESS;
            case "notstarted" -> RowStatus.NOT_STARTED;
            default -> null;
        };
    }

    private boolean isRowBlank(Row row) {
        for (int c = row.getFirstCellNum(); c < row.getLastCellNum(); c++) {
            Cell cell = row.getCell(c);
            if (cell != null && cell.getCellType() != CellType.BLANK) {
                String val = cell.toString().trim();
                if (!val.isEmpty()) return false;
            }
        }
        return true;
    }

    private String cellToString(Cell cell, FormulaEvaluator evaluator) {
        if (cell == null) return "";
        CellType type = cell.getCellType();

        if (type == CellType.FORMULA) {
            try {
                CellValue evaluated = evaluator.evaluate(cell);
                type = evaluated.getCellType();
                return evaluatedCellToString(evaluated, cell);
            } catch (Exception e) {
                return cell.toString();
            }
        }
        return rawCellToString(cell, type);
    }

    private String rawCellToString(Cell cell, CellType type) {
        return switch (type) {
            case STRING -> cell.getStringCellValue().trim();
            case NUMERIC -> {
                if (DateUtil.isCellDateFormatted(cell)) {
                    yield cell.getLocalDateTimeCellValue().toLocalDate().format(DATE_FMT);
                }
                double d = cell.getNumericCellValue();
                yield (d == Math.floor(d) && !Double.isInfinite(d))
                        ? String.valueOf((long) d)
                        : String.valueOf(d);
            }
            case BOOLEAN -> String.valueOf(cell.getBooleanCellValue());
            case BLANK -> "";
            default -> cell.toString().trim();
        };
    }

    private String evaluatedCellToString(CellValue value, Cell original) {
        return switch (value.getCellType()) {
            case STRING -> value.getStringValue().trim();
            case NUMERIC -> {
                if (DateUtil.isCellDateFormatted(original)) {
                    yield LocalDate.ofEpochDay((long) value.getNumberValue()).format(DATE_FMT);
                }
                double d = value.getNumberValue();
                yield (d == Math.floor(d) && !Double.isInfinite(d))
                        ? String.valueOf((long) d)
                        : String.valueOf(d);
            }
            case BOOLEAN -> String.valueOf(value.getBooleanValue());
            default -> "";
        };
    }
}

