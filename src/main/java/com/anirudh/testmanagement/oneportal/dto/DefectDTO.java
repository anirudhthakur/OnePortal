package com.anirudh.testmanagement.oneportal.dto;

import lombok.Builder;
import lombok.Data;
import lombok.Value;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

public class DefectDTO {

    @Value
    @Builder
    public static class ParseHeadersResponse {
        List<String> columns;
    }

    @Value
    @Builder
    public static class DefectSheetSummary {
        Long sheetId;
        String fileName;
        String sheetName;
        Long projectId;
        String idColumnName;
        String summaryColumnName;
        String statusColumnName;
        String detectedDateColumnName;
        String resolvedDateColumnName;
        String severityColumnName;
        long totalRows;
        LocalDateTime createdAt;
        String uploadedByUsername;
    }

    @Value
    @Builder
    public static class DefectRowResponse {
        Long rowId;
        Integer rowIndex;
        String defectId;
        String summary;
        Map<String, String> data;
        LocalDateTime updatedAt;
        String updatedByUsername;
    }

    @Value
    @Builder
    public static class DefectPageResponse {
        Long sheetId;
        String fileName;
        String sheetName;
        List<String> columns;
        List<DefectRowResponse> rows;
        long totalRows;
    }

    @Value
    @Builder
    public static class DropdownItem {
        Long rowId;
        String defectId;
        String summary;
    }

    @Data
    public static class UpdateDefectRowRequest {
        Map<String, String> rowData;
        String defectId;
        String summary;
    }
}
