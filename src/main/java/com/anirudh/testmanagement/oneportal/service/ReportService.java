package com.anirudh.testmanagement.oneportal.service;

import com.anirudh.testmanagement.oneportal.dto.ReportDTO;
import com.anirudh.testmanagement.oneportal.entity.*;
import com.anirudh.testmanagement.oneportal.exception.ResourceNotFoundException;
import com.anirudh.testmanagement.oneportal.repository.*;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
@Transactional(readOnly = true)
public class ReportService {

    private final ProjectRepository projectRepository;
    private final TestDesignSheetRepository testDesignSheetRepository;
    private final TestDesignRowRepository testDesignRowRepository;
    private final DefectSheetRepository defectSheetRepository;
    private final DefectRowRepository defectRowRepository;
    private final ObjectMapper objectMapper;

    private static final DateTimeFormatter DATE_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd");

    public ReportDTO.ProjectReportSummary getProjectReport(Long projectId, int trendDays) {

        Project project = projectRepository.findById(projectId)
                .orElseThrow(() -> new ResourceNotFoundException("Project", projectId));

        // --- test design rows ---
        TestDesignSheet tdSheet = testDesignSheetRepository.findByProjectId(projectId).orElse(null);
        List<TestDesignRow> testRows = tdSheet == null ? Collections.emptyList()
                : testDesignRowRepository.findBySheetIdOrderByRowIndex(tdSheet.getId());

        ReportDTO.ExecutionSummary execSummary = buildExecutionSummary(testRows, projectId);
        List<ReportDTO.StatusCount> executionByStatus = buildExecutionByStatus(testRows);
        List<ReportDTO.DailyActivity> dailyTrend = buildDailyTrend(testRows, tdSheet, trendDays);
        List<ReportDTO.ChannelExecution> channelExec = buildChannelExecution(testRows, tdSheet);

        // --- defect rows ---
        DefectSheet defectSheet = defectSheetRepository.findByProjectId(projectId).orElse(null);
        List<DefectRow> defectRows = defectSheet == null ? Collections.emptyList()
                : defectRowRepository.findAllByProjectId(projectId);

        List<ReportDTO.StatusCount> defectByStatus = buildDefectByStatus(defectRows, defectSheet);
        List<ReportDTO.StatusCount> defectBySeverity = buildDefectBySeverity(defectRows, defectSheet);
        List<ReportDTO.DetectedVsResolvedPoint> detectedVsResolved =
                buildDetectedVsResolved(defectRows, defectSheet);
        List<ReportDTO.DefectRow> defects = buildDefectRows(defectRows, defectSheet);
        List<String> defectColumns = extractDefectColumns(defectRows);

        return ReportDTO.ProjectReportSummary.builder()
                .projectName(project.getName())
                .generatedAt(LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")))
                .highlights(project.getReportHighlights() != null ? project.getReportHighlights() : "")
                .executionSummary(execSummary)
                .executionByStatus(executionByStatus)
                .dailyTrend(dailyTrend)
                .defectByStatus(defectByStatus)
                .defectBySeverity(defectBySeverity)
                .channelExecution(channelExec)
                .detectedVsResolved(detectedVsResolved)
                .defects(defects)
                .defectColumns(defectColumns)
                .build();
    }

    @Transactional
    public void saveHighlights(Long projectId, String highlights) {
        Project project = projectRepository.findById(projectId)
                .orElseThrow(() -> new ResourceNotFoundException("Project", projectId));
        project.setReportHighlights(highlights);
        projectRepository.save(project);
    }

    private ReportDTO.ExecutionSummary buildExecutionSummary(List<TestDesignRow> testRows, Long projectId) {
        long total = testRows.size();
        long notStarted = testRows.stream().filter(r -> r.getRowStatus() == null
                || r.getRowStatus() == TestDesignRow.RowStatus.NOT_STARTED).count();
        long inProgress = testRows.stream().filter(r -> r.getRowStatus() == TestDesignRow.RowStatus.IN_PROGRESS).count();
        long passed = testRows.stream().filter(r -> r.getRowStatus() == TestDesignRow.RowStatus.PASSED).count();
        long failed = testRows.stream().filter(r -> r.getRowStatus() == TestDesignRow.RowStatus.FAILED).count();
        long blocked = testRows.stream().filter(r -> r.getRowStatus() == TestDesignRow.RowStatus.BLOCKED).count();
        long notApplicable = testRows.stream().filter(r -> r.getRowStatus() == TestDesignRow.RowStatus.NOT_APPLICABLE).count();
        long notDelivered = testRows.stream().filter(r -> r.getRowStatus() == TestDesignRow.RowStatus.NOT_DELIVERED).count();

        List<DefectRow> allDefects = defectRowRepository.findAllByProjectId(projectId);
        long totalDefects = allDefects.size();
        long openDefects = 0;
        DefectSheet ds = defectSheetRepository.findByProjectId(projectId).orElse(null);
        if (ds != null && ds.getStatusColumnName() != null) {
            String statusCol = ds.getStatusColumnName();
            openDefects = allDefects.stream()
                    .filter(r -> {
                        String status = parseRowData(r.getRowData()).getOrDefault(statusCol, "").toLowerCase();
                        return !status.equals("closed") && !status.equals("resolved") && !status.equals("fixed");
                    }).count();
        }

        return ReportDTO.ExecutionSummary.builder()
                .total(total).notStarted(notStarted).inProgress(inProgress)
                .passed(passed).failed(failed).blocked(blocked)
                .notApplicable(notApplicable).notDelivered(notDelivered)
                .totalDefects(totalDefects).openDefects(openDefects)
                .build();
    }

    private List<ReportDTO.StatusCount> buildExecutionByStatus(List<TestDesignRow> testRows) {
        Map<String, Long> counts = new LinkedHashMap<>();
        counts.put("Passed",        testRows.stream().filter(r -> r.getRowStatus() == TestDesignRow.RowStatus.PASSED).count());
        counts.put("Failed",        testRows.stream().filter(r -> r.getRowStatus() == TestDesignRow.RowStatus.FAILED).count());
        counts.put("Blocked",       testRows.stream().filter(r -> r.getRowStatus() == TestDesignRow.RowStatus.BLOCKED).count());
        counts.put("In Progress",   testRows.stream().filter(r -> r.getRowStatus() == TestDesignRow.RowStatus.IN_PROGRESS).count());
        counts.put("Not Started",   testRows.stream().filter(r -> r.getRowStatus() == null
                || r.getRowStatus() == TestDesignRow.RowStatus.NOT_STARTED).count());
        counts.put("N/A",           testRows.stream().filter(r -> r.getRowStatus() == TestDesignRow.RowStatus.NOT_APPLICABLE).count());
        counts.put("Not Delivered", testRows.stream().filter(r -> r.getRowStatus() == TestDesignRow.RowStatus.NOT_DELIVERED).count());
        return counts.entrySet().stream()
                .filter(e -> e.getValue() > 0)
                .map(e -> ReportDTO.StatusCount.builder().status(e.getKey()).count(e.getValue()).build())
                .collect(Collectors.toList());
    }

    private List<ReportDTO.DailyActivity> buildDailyTrend(
            List<TestDesignRow> testRows, TestDesignSheet sheet, int days) {
        LocalDate today = LocalDate.now();
        LocalDate from = today.minusDays(days - 1L);
        String execDateCol = sheet != null ? sheet.getExecutionDateColumnName() : null;

        // Group rows by the execution date (from rowData column if configured, else updatedAt)
        Map<LocalDate, List<TestDesignRow>> byDate = testRows.stream()
                .filter(r -> {
                    LocalDate d = resolveExecutionDate(r, execDateCol);
                    return d != null && !d.isBefore(from) && !d.isAfter(today);
                })
                .collect(Collectors.groupingBy(r -> resolveExecutionDate(r, execDateCol)));

        List<ReportDTO.DailyActivity> trend = new ArrayList<>();
        for (LocalDate d = from; !d.isAfter(today); d = d.plusDays(1)) {
            List<TestDesignRow> dayRows = byDate.getOrDefault(d, Collections.emptyList());
            long executed = dayRows.stream().filter(r -> r.getRowStatus() != null
                    && r.getRowStatus() != TestDesignRow.RowStatus.NOT_STARTED).count();
            long passed = dayRows.stream().filter(r -> r.getRowStatus() == TestDesignRow.RowStatus.PASSED).count();
            long failed = dayRows.stream().filter(r -> r.getRowStatus() == TestDesignRow.RowStatus.FAILED).count();
            long blocked = dayRows.stream().filter(r -> r.getRowStatus() == TestDesignRow.RowStatus.BLOCKED).count();
            long notApplicable = dayRows.stream().filter(r -> r.getRowStatus() == TestDesignRow.RowStatus.NOT_APPLICABLE).count();
            long notDelivered = dayRows.stream().filter(r -> r.getRowStatus() == TestDesignRow.RowStatus.NOT_DELIVERED).count();
            trend.add(ReportDTO.DailyActivity.builder()
                    .date(d.format(DATE_FMT))
                    .executed(executed).passed(passed).failed(failed).blocked(blocked)
                    .notApplicable(notApplicable).notDelivered(notDelivered)
                    .build());
        }
        return trend;
    }

    private LocalDate resolveExecutionDate(TestDesignRow row, String execDateCol) {
        if (execDateCol != null) {
            Map<String, String> data = parseRowData(row.getRowData());
            String val = data.getOrDefault(execDateCol, "").trim();
            if (!val.isBlank()) {
                try {
                    return LocalDate.parse(val, DATE_FMT);
                } catch (Exception e) {
                    // try other formats
                    try {
                        return LocalDate.parse(val, DateTimeFormatter.ofPattern("dd/MM/yyyy"));
                    } catch (Exception ignored) { /* fall through */ }
                }
            }
        }
        return row.getUpdatedAt() != null ? row.getUpdatedAt().toLocalDate() : null;
    }

    private List<ReportDTO.ChannelExecution> buildChannelExecution(
            List<TestDesignRow> testRows, TestDesignSheet sheet) {
        String channelCol = sheet != null ? sheet.getChannelColumnName() : null;
        if (channelCol == null || channelCol.isBlank()) return Collections.emptyList();

        Map<String, List<TestDesignRow>> byChannel = testRows.stream()
                .collect(Collectors.groupingBy(r -> {
                    String ch = parseRowData(r.getRowData()).getOrDefault(channelCol, "");
                    return ch.isBlank() ? "(blank)" : ch;
                }));

        return byChannel.entrySet().stream()
                .sorted(Map.Entry.comparingByKey())
                .map(e -> {
                    List<TestDesignRow> rows = e.getValue();
                    long total = rows.size();
                    long passed = rows.stream().filter(r -> r.getRowStatus() == TestDesignRow.RowStatus.PASSED).count();
                    long failed = rows.stream().filter(r -> r.getRowStatus() == TestDesignRow.RowStatus.FAILED).count();
                    long blocked = rows.stream().filter(r -> r.getRowStatus() == TestDesignRow.RowStatus.BLOCKED).count();
                    long inProgress = rows.stream().filter(r -> r.getRowStatus() == TestDesignRow.RowStatus.IN_PROGRESS).count();
                    long notStarted = rows.stream().filter(r -> r.getRowStatus() == null
                            || r.getRowStatus() == TestDesignRow.RowStatus.NOT_STARTED).count();
                    long notApplicable = rows.stream().filter(r -> r.getRowStatus() == TestDesignRow.RowStatus.NOT_APPLICABLE).count();
                    long notDelivered = rows.stream().filter(r -> r.getRowStatus() == TestDesignRow.RowStatus.NOT_DELIVERED).count();
                    return ReportDTO.ChannelExecution.builder()
                            .channel(e.getKey()).total(total)
                            .passed(passed).failed(failed).blocked(blocked)
                            .inProgress(inProgress).notStarted(notStarted)
                            .notApplicable(notApplicable).notDelivered(notDelivered)
                            .build();
                }).collect(Collectors.toList());
    }

    private List<ReportDTO.StatusCount> buildDefectByStatus(
            List<DefectRow> defectRows, DefectSheet sheet) {
        if (sheet == null || sheet.getStatusColumnName() == null) return Collections.emptyList();
        String col = sheet.getStatusColumnName();
        return defectRows.stream()
                .collect(Collectors.groupingBy(r -> {
                    String v = parseRowData(r.getRowData()).getOrDefault(col, "(unknown)");
                    return v.isBlank() ? "(unknown)" : v;
                }, Collectors.counting()))
                .entrySet().stream()
                .sorted(Map.Entry.<String, Long>comparingByValue().reversed())
                .map(e -> ReportDTO.StatusCount.builder().status(e.getKey()).count(e.getValue()).build())
                .collect(Collectors.toList());
    }

    private List<ReportDTO.StatusCount> buildDefectBySeverity(
            List<DefectRow> defectRows, DefectSheet sheet) {
        if (sheet == null || sheet.getSeverityColumnName() == null) return Collections.emptyList();
        String col = sheet.getSeverityColumnName();
        return defectRows.stream()
                .collect(Collectors.groupingBy(r -> {
                    String v = parseRowData(r.getRowData()).getOrDefault(col, "(unknown)");
                    return v.isBlank() ? "(unknown)" : v;
                }, Collectors.counting()))
                .entrySet().stream()
                .sorted(Map.Entry.<String, Long>comparingByValue().reversed())
                .map(e -> ReportDTO.StatusCount.builder().status(e.getKey()).count(e.getValue()).build())
                .collect(Collectors.toList());
    }

    private List<ReportDTO.DetectedVsResolvedPoint> buildDetectedVsResolved(
            List<DefectRow> defectRows, DefectSheet sheet) {
        if (sheet == null) return Collections.emptyList();
        String detectedCol = sheet.getDetectedDateColumnName();
        String resolvedCol = sheet.getResolvedDateColumnName();
        if (detectedCol == null && resolvedCol == null) return Collections.emptyList();

        Map<String, long[]> counts = new TreeMap<>();
        for (DefectRow row : defectRows) {
            Map<String, String> data = parseRowData(row.getRowData());
            if (detectedCol != null) {
                String d = data.getOrDefault(detectedCol, "").trim();
                if (!d.isBlank()) counts.computeIfAbsent(d, k -> new long[2])[0]++;
            }
            if (resolvedCol != null) {
                String r = data.getOrDefault(resolvedCol, "").trim();
                if (!r.isBlank()) counts.computeIfAbsent(r, k -> new long[2])[1]++;
            }
        }

        return counts.entrySet().stream()
                .map(e -> ReportDTO.DetectedVsResolvedPoint.builder()
                        .date(e.getKey())
                        .detected(e.getValue()[0])
                        .resolved(e.getValue()[1])
                        .build())
                .collect(Collectors.toList());
    }

    private List<ReportDTO.DefectRow> buildDefectRows(List<DefectRow> defectRows, DefectSheet sheet) {
        String statusCol   = sheet != null ? sheet.getStatusColumnName()       : null;
        String detectedCol = sheet != null ? sheet.getDetectedDateColumnName() : null;
        String resolvedCol = sheet != null ? sheet.getResolvedDateColumnName() : null;

        // Build a map of defectRow.id → linkedTestCount in one query
        Map<Long, Long> blockedByDefectId = testDesignRowRepository.countLinkedTestsByDefectId()
                .stream()
                .collect(Collectors.toMap(
                        row -> ((Number) row[0]).longValue(),
                        row -> ((Number) row[1]).longValue()
                ));

        return defectRows.stream().map(r -> {
            Map<String, String> data = parseRowData(r.getRowData());
            // Inject comments as a virtual column so it appears in the report table
            if (r.getComments() != null && !r.getComments().isBlank()) {
                data = new LinkedHashMap<>(data);
                data.put("Comments", r.getComments());
            }
            long impacted = blockedByDefectId.getOrDefault(r.getId(), 0L);
            return ReportDTO.DefectRow.builder()
                    .defectId(r.getDefectId())
                    .summary(r.getSummary())
                    .status(statusCol   != null ? data.getOrDefault(statusCol,   "") : null)
                    .detectedDate(detectedCol != null ? data.getOrDefault(detectedCol, "") : null)
                    .resolvedDate(resolvedCol != null ? data.getOrDefault(resolvedCol, "") : null)
                    .impactedScenarios(impacted)
                    .allData(data)
                    .build();
        }).collect(Collectors.toList());
    }

    private List<String> extractDefectColumns(List<DefectRow> defectRows) {
        if (defectRows.isEmpty()) return Collections.emptyList();
        List<String> cols = new ArrayList<>(parseRowData(defectRows.get(0).getRowData()).keySet());
        boolean anyComments = defectRows.stream().anyMatch(r -> r.getComments() != null && !r.getComments().isBlank());
        if (anyComments && !cols.contains("Comments")) cols.add("Comments");
        return cols;
    }

    private Map<String, String> parseRowData(String json) {
        if (json == null || json.isBlank()) return Collections.emptyMap();
        try {
            return objectMapper.readValue(json, new TypeReference<LinkedHashMap<String, String>>() {});
        } catch (Exception e) {
            log.warn("Could not parse rowData: {}", e.getMessage());
            return Collections.emptyMap();
        }
    }
}
