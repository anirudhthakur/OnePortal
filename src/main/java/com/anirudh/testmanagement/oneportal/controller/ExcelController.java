package com.anirudh.testmanagement.oneportal.controller;

import com.anirudh.testmanagement.oneportal.dto.TestDesignDTO;
import com.anirudh.testmanagement.oneportal.service.ExcelImportService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

@RestController
@RequestMapping("/api/v1/excel")
@RequiredArgsConstructor
@Tag(name = "Excel Import", description = "Upload and manage Excel test design files")
public class ExcelController {

    private final ExcelImportService excelImportService;

    @PostMapping("/parse-headers")
    @Operation(summary = "Parse column headers from an .xlsx file without persisting")
    public List<String> parseHeaders(@RequestParam("file") MultipartFile file) {
        return excelImportService.parseHeaders(file);
    }

    @PostMapping("/upload")
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Upload an .xlsx file and import test design rows")
    public TestDesignDTO.UploadResponse upload(
            @RequestParam("file") MultipartFile file,
            @RequestParam(value = "uploaderId", required = false) Long uploaderId,
            @RequestParam(value = "projectId", required = false) Long projectId,
            @RequestParam(value = "executionDateColumnName", required = false) String executionDateColumnName,
            @RequestParam(value = "channelColumnName", required = false) String channelColumnName) {

        if (file.isEmpty()) {
            throw new IllegalArgumentException("Uploaded file is empty");
        }
        String name = file.getOriginalFilename();
        if (name == null || !name.toLowerCase().endsWith(".xlsx")) {
            throw new IllegalArgumentException("Only .xlsx files are supported");
        }
        return excelImportService.importExcel(file, uploaderId, projectId, executionDateColumnName, channelColumnName);
    }

    @GetMapping("/sheets")
    @Operation(summary = "List all uploaded test design sheets (paginated)")
    public Page<TestDesignDTO.SheetSummary> getAllSheets(
            @PageableDefault(size = 20, sort = "createdAt") Pageable pageable) {
        return excelImportService.getAllSheets(pageable);
    }

    @GetMapping("/sheets/{sheetId}")
    @Operation(summary = "Get full data for a specific sheet")
    public TestDesignDTO.SheetDataResponse getSheetData(@PathVariable Long sheetId) {
        return excelImportService.getSheetData(sheetId);
    }

    @GetMapping("/sheets/by-project/{projectId}")
    @Operation(summary = "Get the sheet linked to a project (with row metadata)")
    public TestDesignDTO.ProjectSheetDataResponse getProjectSheet(@PathVariable Long projectId) {
        return excelImportService.getProjectSheetData(projectId);
    }

    @PatchMapping("/sheets/{sheetId}/rows/{rowId}")
    @Operation(summary = "Update assignment, status or cell data of a row")
    public TestDesignDTO.RowWithMeta updateRow(
            @PathVariable Long sheetId,
            @PathVariable Long rowId,
            @RequestParam Long requesterId,
            @RequestBody TestDesignDTO.UpdateRowRequest request) {
        return excelImportService.updateRow(sheetId, rowId, requesterId, request);
    }

    @PostMapping("/sheets/{sheetId}/rows")
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Add a blank row to a project sheet (OWNER or TESTER only)")
    public TestDesignDTO.RowWithMeta addRow(
            @PathVariable Long sheetId,
            @RequestParam Long requesterId) {
        return excelImportService.addRow(sheetId, requesterId);
    }

    @DeleteMapping("/sheets/{sheetId}/rows/{rowId}")
    @Operation(summary = "Delete a single row from a project sheet (OWNER or TESTER only)")
    public ResponseEntity<Void> deleteRow(
            @PathVariable Long sheetId,
            @PathVariable Long rowId,
            @RequestParam Long requesterId) {
        excelImportService.deleteRow(sheetId, rowId, requesterId);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/replace")
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Replace existing project sheet with a new .xlsx (drops old sheet, smart-maps Status/Assigned To columns)")
    public TestDesignDTO.UploadResponse replace(
            @RequestParam("file") MultipartFile file,
            @RequestParam(value = "uploaderId", required = false) Long uploaderId,
            @RequestParam Long projectId,
            @RequestParam(value = "executionDateColumnName", required = false) String executionDateColumnName,
            @RequestParam(value = "channelColumnName", required = false) String channelColumnName) {

        if (file.isEmpty()) throw new IllegalArgumentException("Uploaded file is empty");
        String name = file.getOriginalFilename();
        if (name == null || !name.toLowerCase().endsWith(".xlsx")) {
            throw new IllegalArgumentException("Only .xlsx files are supported");
        }
        return excelImportService.replaceSheet(file, uploaderId, projectId, executionDateColumnName, channelColumnName);
    }

    @DeleteMapping("/sheets/{sheetId}")
    @Operation(summary = "Delete a sheet and all its rows")
    public ResponseEntity<Void> deleteSheet(@PathVariable Long sheetId) {
        excelImportService.deleteSheet(sheetId);
        return ResponseEntity.noContent().build();
    }
}
