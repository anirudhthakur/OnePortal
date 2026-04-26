package com.anirudh.testmanagement.oneportal.service;

import com.anirudh.testmanagement.oneportal.dto.DefectDTO;
import com.anirudh.testmanagement.oneportal.entity.*;
import com.anirudh.testmanagement.oneportal.entity.ProjectMember.ProjectRole;
import com.anirudh.testmanagement.oneportal.exception.ResourceNotFoundException;
import com.anirudh.testmanagement.oneportal.repository.*;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.poi.ss.usermodel.*;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;

@Service
@RequiredArgsConstructor
@Slf4j
@Transactional(readOnly = true)
public class DefectService {

    private final DefectSheetRepository sheetRepository;
    private final DefectRowRepository rowRepository;
    private final ProjectRepository projectRepository;
    private final ProjectMemberRepository projectMemberRepository;
    private final UserRepository userRepository;
    private final ObjectMapper objectMapper;

    private static final DateTimeFormatter DATE_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd");

    /**
     * Parse the headers from an uploaded Excel file without persisting anything.
     */
    public DefectDTO.ParseHeadersResponse parseHeaders(MultipartFile file) {
        try (Workbook workbook = WorkbookFactory.create(file.getInputStream())) {
            Sheet sheet = workbook.getSheetAt(0);
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
            return DefectDTO.ParseHeadersResponse.builder().columns(columns).build();
        } catch (IOException e) {
            throw new IllegalArgumentException("Failed to read Excel file: " + e.getMessage(), e);
        }
    }

    /**
     * Parse and persist the defect sheet for a project.
     * If a defect sheet already exists for the project, it is replaced.
     */
    @Transactional
    public DefectDTO.DefectSheetSummary saveSheet(
            MultipartFile file, Long projectId, Long requesterId,
            String idColumnName, String summaryColumnName, String statusColumnName,
            String detectedDateColumnName, String resolvedDateColumnName, String severityColumnName) {

        Project project = projectRepository.findById(projectId)
                .orElseThrow(() -> new ResourceNotFoundException("Project", projectId));

        requireOwnerOrAdmin(projectId, requesterId);

        User uploader = userRepository.findById(requesterId).orElse(null);

        // Replace existing sheet if present
        sheetRepository.findByProjectId(projectId).ifPresent(existing -> {
            rowRepository.deleteLinkedDefectsByDefectSheetId(existing.getId());
            rowRepository.deleteBySheetId(existing.getId());
            sheetRepository.delete(existing);
            sheetRepository.flush();
        });

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

            if (!columns.contains(idColumnName)) {
                throw new IllegalArgumentException(
                        "ID column '" + idColumnName + "' not found in file headers");
            }
            if (!columns.contains(summaryColumnName)) {
                throw new IllegalArgumentException(
                        "Summary column '" + summaryColumnName + "' not found in file headers");
            }
            if (statusColumnName != null && !statusColumnName.isBlank() && !columns.contains(statusColumnName)) {
                throw new IllegalArgumentException(
                        "Status column '" + statusColumnName + "' not found in file headers");
            }
            if (detectedDateColumnName != null && !detectedDateColumnName.isBlank() && !columns.contains(detectedDateColumnName)) {
                throw new IllegalArgumentException(
                        "Detected Date column '" + detectedDateColumnName + "' not found in file headers");
            }
            if (resolvedDateColumnName != null && !resolvedDateColumnName.isBlank() && !columns.contains(resolvedDateColumnName)) {
                throw new IllegalArgumentException(
                        "Resolved Date column '" + resolvedDateColumnName + "' not found in file headers");
            }

            String resolvedStatusCol = (statusColumnName != null && !statusColumnName.isBlank()) ? statusColumnName : null;
            String resolvedDetectedDateCol = (detectedDateColumnName != null && !detectedDateColumnName.isBlank()) ? detectedDateColumnName : null;
            String resolvedResolvedDateCol = (resolvedDateColumnName != null && !resolvedDateColumnName.isBlank()) ? resolvedDateColumnName : null;
            String resolvedSeverityCol = (severityColumnName != null && !severityColumnName.isBlank()) ? severityColumnName : null;

            DefectSheet defectSheet = DefectSheet.builder()
                    .fileName(file.getOriginalFilename())
                    .sheetName(sheetTabName)
                    .project(project)
                    .uploadedBy(uploader)
                    .idColumnName(idColumnName)
                    .summaryColumnName(summaryColumnName)
                    .statusColumnName(resolvedStatusCol)
                    .detectedDateColumnName(resolvedDetectedDateCol)
                    .resolvedDateColumnName(resolvedResolvedDateCol)
                    .severityColumnName(resolvedSeverityCol)
                    .build();
            defectSheet = sheetRepository.save(defectSheet);

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

                String defectId = rowMap.getOrDefault(idColumnName, "").trim();
                if (defectId.isEmpty()) continue;

                String summary = rowMap.getOrDefault(summaryColumnName, "");

                DefectRow defectRow = DefectRow.builder()
                        .sheet(defectSheet)
                        .rowIndex(importedRows + 1)
                        .defectId(defectId)
                        .summary(summary)
                        .rowData(objectMapper.writeValueAsString(rowMap))
                        .build();
                rowRepository.save(defectRow);
                importedRows++;
            }

            log.info("Imported {} defect rows from '{}' for project {}", importedRows, file.getOriginalFilename(), projectId);

            return toSummary(defectSheet, importedRows);

        } catch (IOException e) {
            throw new IllegalArgumentException("Failed to read Excel file: " + e.getMessage(), e);
        }
    }

    /**
     * Get the defect sheet summary for a project.
     */
    public DefectDTO.DefectSheetSummary getSheetSummaryByProject(Long projectId) {
        DefectSheet sheet = sheetRepository.findByProjectId(projectId)
                .orElseThrow(() -> new ResourceNotFoundException("DefectSheet for project", projectId));
        long total = rowRepository.countBySheetId(sheet.getId());
        return toSummary(sheet, total);
    }

    /**
     * Get paginated defect rows with all column data.
     */
    public DefectDTO.DefectPageResponse getDefectPage(Long sheetId, Pageable pageable) {
        DefectSheet sheet = sheetRepository.findById(sheetId)
                .orElseThrow(() -> new ResourceNotFoundException("DefectSheet", sheetId));

        Page<DefectRow> page = rowRepository.findBySheetIdOrderByRowIndex(sheetId, pageable);
        List<DefectDTO.DefectRowResponse> rows = new ArrayList<>();
        List<String> columns = new ArrayList<>();

        for (DefectRow row : page.getContent()) {
            try {
                Map<String, String> map = objectMapper.readValue(
                        row.getRowData(), new TypeReference<LinkedHashMap<String, String>>() {});
                if (columns.isEmpty()) columns.addAll(map.keySet());
                rows.add(DefectDTO.DefectRowResponse.builder()
                        .rowId(row.getId())
                        .rowIndex(row.getRowIndex())
                        .defectId(row.getDefectId())
                        .summary(row.getSummary())
                        .data(map)
                        .updatedAt(row.getUpdatedAt())
                        .updatedByUsername(row.getUpdatedBy() != null ? row.getUpdatedBy().getUsername() : null)
                        .build());
            } catch (IOException e) {
                log.warn("Could not deserialize rowData for defect row {}: {}", row.getId(), e.getMessage());
            }
        }

        return DefectDTO.DefectPageResponse.builder()
                .sheetId(sheet.getId())
                .fileName(sheet.getFileName())
                .sheetName(sheet.getSheetName())
                .columns(columns)
                .rows(rows)
                .totalRows(page.getTotalElements())
                .build();
    }

    /**
     * Lightweight list for the multi-select dropdown in the test cases page.
     */
    public List<DefectDTO.DropdownItem> getDropdownItems(Long projectId) {
        DefectSheet sheet = sheetRepository.findByProjectId(projectId).orElse(null);
        if (sheet == null) return Collections.emptyList();

        return rowRepository.findBySheetIdOrderByRowIndex(sheet.getId()).stream()
                .map(r -> DefectDTO.DropdownItem.builder()
                        .rowId(r.getId())
                        .defectId(r.getDefectId())
                        .summary(r.getSummary())
                        .build())
                .toList();
    }

    /**
     * Update a single defect row's cell data, defectId and summary (OWNER or TESTER only).
     */
    @Transactional
    public DefectDTO.DefectRowResponse updateRow(Long sheetId, Long rowId, Long requesterId,
                                                  DefectDTO.UpdateDefectRowRequest request) {
        DefectSheet sheet = sheetRepository.findById(sheetId)
                .orElseThrow(() -> new ResourceNotFoundException("DefectSheet", sheetId));
        DefectRow row = rowRepository.findById(rowId)
                .orElseThrow(() -> new ResourceNotFoundException("DefectRow", rowId));

        if (!row.getSheet().getId().equals(sheetId)) {
            throw new IllegalArgumentException("Row does not belong to this sheet");
        }

        requireTesterOrOwner(sheet.getProject().getId(), requesterId);
        User requester = userRepository.findById(requesterId).orElse(null);

        if (request.getRowData() != null && !request.getRowData().isEmpty()) {
            try {
                row.setRowData(objectMapper.writeValueAsString(request.getRowData()));
            } catch (JsonProcessingException e) {
                throw new IllegalStateException("Could not serialize row data");
            }
        }
        if (request.getDefectId() != null && !request.getDefectId().isBlank()) {
            row.setDefectId(request.getDefectId().trim());
        }
        if (request.getSummary() != null) {
            row.setSummary(request.getSummary());
        }
        row.setUpdatedAt(LocalDateTime.now());
        row.setUpdatedBy(requester);

        row = rowRepository.save(row);

        try {
            Map<String, String> map = objectMapper.readValue(
                    row.getRowData(), new TypeReference<LinkedHashMap<String, String>>() {});
            return DefectDTO.DefectRowResponse.builder()
                    .rowId(row.getId())
                    .rowIndex(row.getRowIndex())
                    .defectId(row.getDefectId())
                    .summary(row.getSummary())
                    .data(map)
                    .updatedAt(row.getUpdatedAt())
                    .updatedByUsername(row.getUpdatedBy() != null ? row.getUpdatedBy().getUsername() : null)
                    .build();
        } catch (IOException e) {
            throw new IllegalStateException("Could not deserialize row data");
        }
    }

    /**
     * Add a blank defect row to a sheet (OWNER or TESTER only).
     */
    @Transactional
    public DefectDTO.DefectRowResponse addRow(Long sheetId, Long requesterId) {
        DefectSheet sheet = sheetRepository.findById(sheetId)
                .orElseThrow(() -> new ResourceNotFoundException("DefectSheet", sheetId));

        requireTesterOrOwner(sheet.getProject().getId(), requesterId);
        User requester = userRepository.findById(requesterId).orElse(null);

        List<DefectRow> existingRows = rowRepository.findBySheetIdOrderByRowIndex(sheetId);
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

        int nextIndex = existingRows.stream().mapToInt(DefectRow::getRowIndex).max().orElse(0) + 1;

        try {
            DefectRow newRow = DefectRow.builder()
                    .sheet(sheet)
                    .rowIndex(nextIndex)
                    .defectId("NEW-" + nextIndex)
                    .summary("")
                    .rowData(objectMapper.writeValueAsString(blankMap))
                    .updatedAt(LocalDateTime.now())
                    .updatedBy(requester)
                    .build();
            newRow = rowRepository.save(newRow);

            return DefectDTO.DefectRowResponse.builder()
                    .rowId(newRow.getId())
                    .rowIndex(newRow.getRowIndex())
                    .defectId(newRow.getDefectId())
                    .summary(newRow.getSummary())
                    .data(blankMap)
                    .updatedAt(newRow.getUpdatedAt())
                    .updatedByUsername(newRow.getUpdatedBy() != null ? newRow.getUpdatedBy().getUsername() : null)
                    .build();
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Could not serialize row data");
        }
    }

    /**
     * Delete a single defect row and clean up any test-case links (OWNER or TESTER only).
     */
    @Transactional
    public void deleteRow(Long sheetId, Long rowId, Long requesterId) {
        DefectSheet sheet = sheetRepository.findById(sheetId)
                .orElseThrow(() -> new ResourceNotFoundException("DefectSheet", sheetId));
        DefectRow row = rowRepository.findById(rowId)
                .orElseThrow(() -> new ResourceNotFoundException("DefectRow", rowId));

        if (!row.getSheet().getId().equals(sheetId)) {
            throw new IllegalArgumentException("Row does not belong to this sheet");
        }

        requireTesterOrOwner(sheet.getProject().getId(), requesterId);

        rowRepository.deleteLinkedDefectsByRowId(rowId);
        rowRepository.deleteById(rowId);
    }

    /**
     * Delete a defect sheet and all its rows (OWNER or global ADMIN only).
     */
    @Transactional
    public void deleteSheet(Long sheetId, Long requesterId) {
        DefectSheet sheet = sheetRepository.findById(sheetId)
                .orElseThrow(() -> new ResourceNotFoundException("DefectSheet", sheetId));
        requireOwnerOrAdmin(sheet.getProject().getId(), requesterId);
        rowRepository.deleteLinkedDefectsByDefectSheetId(sheetId);
        rowRepository.deleteBySheetId(sheetId);
        sheetRepository.deleteById(sheetId);
    }

    /**
     * Called from ProjectService when a project is deleted — no permission check needed.
     */
    @Transactional
    public void deleteSheetByProject(Long projectId) {
        sheetRepository.findByProjectId(projectId).ifPresent(sheet -> {
            rowRepository.deleteLinkedDefectsByDefectSheetId(sheet.getId());
            rowRepository.deleteBySheetId(sheet.getId());
            sheetRepository.deleteById(sheet.getId());
        });
    }

    // --- helpers ---

    private DefectDTO.DefectSheetSummary toSummary(DefectSheet sheet, long totalRows) {
        return DefectDTO.DefectSheetSummary.builder()
                .sheetId(sheet.getId())
                .fileName(sheet.getFileName())
                .sheetName(sheet.getSheetName())
                .projectId(sheet.getProject().getId())
                .idColumnName(sheet.getIdColumnName())
                .summaryColumnName(sheet.getSummaryColumnName())
                .statusColumnName(sheet.getStatusColumnName())
                .detectedDateColumnName(sheet.getDetectedDateColumnName())
                .resolvedDateColumnName(sheet.getResolvedDateColumnName())
                .severityColumnName(sheet.getSeverityColumnName())
                .totalRows(totalRows)
                .createdAt(sheet.getCreatedAt())
                .uploadedByUsername(sheet.getUploadedBy() != null ? sheet.getUploadedBy().getUsername() : null)
                .build();
    }

    private void requireOwnerOrAdmin(Long projectId, Long requesterId) {
        User requester = userRepository.findById(requesterId)
                .orElseThrow(() -> new ResourceNotFoundException("User", requesterId));
        if (requester.getRole() == User.Role.ADMIN) return;

        ProjectMember member = projectMemberRepository.findByProjectIdAndUserId(projectId, requesterId)
                .orElseThrow(() -> new AccessDeniedException("You are not a member of this project"));
        if (member.getRole() != ProjectRole.OWNER) {
            throw new AccessDeniedException("Only the project OWNER or a global ADMIN can manage defect sheets");
        }
    }

    private void requireTesterOrOwner(Long projectId, Long requesterId) {
        User requester = userRepository.findById(requesterId)
                .orElseThrow(() -> new ResourceNotFoundException("User", requesterId));
        if (requester.getRole() == User.Role.ADMIN) return;

        ProjectMember member = projectMemberRepository.findByProjectIdAndUserId(projectId, requesterId)
                .orElseThrow(() -> new AccessDeniedException("You are not a member of this project"));
        if (member.getRole() == ProjectRole.VIEWER) {
            throw new AccessDeniedException("VIEWERs cannot edit defect rows");
        }
    }

    private boolean isRowBlank(Row row) {
        for (int c = row.getFirstCellNum(); c < row.getLastCellNum(); c++) {
            Cell cell = row.getCell(c);
            if (cell != null && cell.getCellType() != CellType.BLANK
                    && !cell.toString().trim().isEmpty()) {
                return false;
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
                return switch (evaluated.getCellType()) {
                    case STRING -> evaluated.getStringValue().trim();
                    case NUMERIC -> {
                        if (DateUtil.isCellDateFormatted(cell)) {
                            yield LocalDate.ofEpochDay((long) evaluated.getNumberValue()).format(DATE_FMT);
                        }
                        double d = evaluated.getNumberValue();
                        yield (d == Math.floor(d) && !Double.isInfinite(d))
                                ? String.valueOf((long) d) : String.valueOf(d);
                    }
                    case BOOLEAN -> String.valueOf(evaluated.getBooleanValue());
                    default -> "";
                };
            } catch (Exception e) {
                return cell.toString();
            }
        }
        return switch (type) {
            case STRING -> cell.getStringCellValue().trim();
            case NUMERIC -> {
                if (DateUtil.isCellDateFormatted(cell)) {
                    yield cell.getLocalDateTimeCellValue().toLocalDate().format(DATE_FMT);
                }
                double d = cell.getNumericCellValue();
                yield (d == Math.floor(d) && !Double.isInfinite(d))
                        ? String.valueOf((long) d) : String.valueOf(d);
            }
            case BOOLEAN -> String.valueOf(cell.getBooleanCellValue());
            case BLANK -> "";
            default -> cell.toString().trim();
        };
    }
}
