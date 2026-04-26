package com.anirudh.testmanagement.oneportal.dto;

import com.anirudh.testmanagement.oneportal.entity.TestDesignRow.RowStatus;
import lombok.Builder;
import lombok.Value;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Set;

public class TestDesignDTO {

    @Value
    @Builder
    public static class UploadResponse {
        Long sheetId;
        String fileName;
        String sheetName;
        int totalRows;
        List<String> columns;
    }

    @Value
    @Builder
    public static class SheetSummary {
        Long sheetId;
        String fileName;
        String sheetName;
        long totalRows;
        LocalDateTime createdAt;
        String uploadedByUsername;
        Long projectId;
    }

    @Value
    @Builder
    public static class SheetDataResponse {
        Long sheetId;
        String fileName;
        String sheetName;
        List<String> columns;
        List<Map<String, String>> rows;
    }

    @Value
    @Builder
    public static class RowWithMeta {
        Long rowId;
        Integer rowIndex;
        Long assignedToId;
        String assignedToUsername;
        RowStatus rowStatus;
        Map<String, String> data;
        Set<Long> linkedDefectIds;
        LocalDateTime updatedAt;
        String updatedByUsername;
    }

    @Value
    @Builder
    public static class ProjectSheetDataResponse {
        Long sheetId;
        String fileName;
        String sheetName;
        Long projectId;
        List<String> columns;
        List<RowWithMeta> rows;
    }

    @Value
    @Builder
    public static class UpdateRowRequest {
        Long assignedToId;
        RowStatus rowStatus;
        Map<String, String> rowData;
        Set<Long> linkedDefectIds;
    }

    @Value
    @Builder
    public static class AddRowResponse {
        Long rowId;
        Integer rowIndex;
        RowStatus rowStatus;
        Map<String, String> data;
    }
}
