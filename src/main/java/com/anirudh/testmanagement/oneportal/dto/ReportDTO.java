package com.anirudh.testmanagement.oneportal.dto;

import lombok.Builder;
import lombok.Value;

import java.util.List;
import java.util.Map;

public class ReportDTO {

    @Value
    @Builder
    public static class ExecutionSummary {
        long total;
        long notStarted;
        long inProgress;
        long passed;
        long failed;
        long blocked;
        long notApplicable;
        long notDelivered;
        long totalDefects;
        long openDefects;
    }

    @Value
    @Builder
    public static class DailyActivity {
        String date;
        long executed;
        long passed;
        long failed;
        long blocked;
        long notApplicable;
        long notDelivered;
    }

    @Value
    @Builder
    public static class StatusCount {
        String status;
        long count;
    }

    @Value
    @Builder
    public static class ChannelExecution {
        String channel;
        long total;
        long passed;
        long failed;
        long blocked;
        long notStarted;
        long inProgress;
        long notApplicable;
        long notDelivered;
    }

    @Value
    @Builder
    public static class DetectedVsResolvedPoint {
        String date;
        long detected;
        long resolved;
    }

    @Value
    @Builder
    public static class DefectRow {
        String defectId;
        String summary;
        String status;
        String detectedDate;
        String resolvedDate;
        long impactedScenarios;
        Map<String, String> allData;
    }

    @Value
    @Builder
    public static class ProjectReportSummary {
        String projectName;
        String generatedAt;
        ExecutionSummary executionSummary;
        List<StatusCount> executionByStatus;
        List<DailyActivity> dailyTrend;
        List<StatusCount> defectByStatus;
        List<StatusCount> defectBySeverity;
        List<ChannelExecution> channelExecution;
        List<DetectedVsResolvedPoint> detectedVsResolved;
        List<DefectRow> defects;
        List<String> defectColumns;
    }
}
