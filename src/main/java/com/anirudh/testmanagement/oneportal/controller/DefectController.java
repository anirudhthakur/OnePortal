package com.anirudh.testmanagement.oneportal.controller;

import com.anirudh.testmanagement.oneportal.dto.DefectDTO;
import com.anirudh.testmanagement.oneportal.service.DefectService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

@RestController
@RequestMapping("/api/v1/defects")
@RequiredArgsConstructor
@Tag(name = "Defects")
public class DefectController {

    private final DefectService defectService;

    @Operation(summary = "Parse headers from a defect extract without persisting")
    @PostMapping("/parse-headers")
    public ResponseEntity<DefectDTO.ParseHeadersResponse> parseHeaders(
            @RequestParam("file") MultipartFile file) {
        return ResponseEntity.ok(defectService.parseHeaders(file));
    }

    @Operation(summary = "Upload and persist a defect extract for a project")
    @PostMapping("/sheets")
    public ResponseEntity<DefectDTO.DefectSheetSummary> saveSheet(
            @RequestParam("file") MultipartFile file,
            @RequestParam Long projectId,
            @RequestParam Long requesterId,
            @RequestParam String idColumnName,
            @RequestParam String summaryColumnName,
            @RequestParam(required = false) String statusColumnName,
            @RequestParam(required = false) String detectedDateColumnName,
            @RequestParam(required = false) String resolvedDateColumnName,
            @RequestParam(required = false) String severityColumnName) {
        return ResponseEntity.ok(
                defectService.saveSheet(file, projectId, requesterId, idColumnName, summaryColumnName,
                        statusColumnName, detectedDateColumnName, resolvedDateColumnName, severityColumnName));
    }

    @Operation(summary = "Get defect sheet summary for a project")
    @GetMapping("/sheets/by-project/{projectId}")
    public ResponseEntity<DefectDTO.DefectSheetSummary> getSheetByProject(
            @PathVariable Long projectId) {
        return ResponseEntity.ok(defectService.getSheetSummaryByProject(projectId));
    }

    @Operation(summary = "Get paginated defect rows for the defects page")
    @GetMapping("/sheets/{sheetId}/rows")
    public ResponseEntity<DefectDTO.DefectPageResponse> getDefectRows(
            @PathVariable Long sheetId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size) {
        return ResponseEntity.ok(
                defectService.getDefectPage(sheetId, PageRequest.of(page, size)));
    }

    @Operation(summary = "Update a single defect row's data (OWNER or TESTER only)")
    @PatchMapping("/sheets/{sheetId}/rows/{rowId}")
    public ResponseEntity<DefectDTO.DefectRowResponse> updateRow(
            @PathVariable Long sheetId,
            @PathVariable Long rowId,
            @RequestParam Long requesterId,
            @RequestBody DefectDTO.UpdateDefectRowRequest request) {
        return ResponseEntity.ok(defectService.updateRow(sheetId, rowId, requesterId, request));
    }

    @Operation(summary = "Add a blank defect row to a sheet (OWNER or TESTER only)")
    @PostMapping("/sheets/{sheetId}/rows")
    @ResponseStatus(HttpStatus.CREATED)
    public ResponseEntity<DefectDTO.DefectRowResponse> addRow(
            @PathVariable Long sheetId,
            @RequestParam Long requesterId) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(defectService.addRow(sheetId, requesterId));
    }

    @Operation(summary = "Delete a single defect row (OWNER or TESTER only)")
    @DeleteMapping("/sheets/{sheetId}/rows/{rowId}")
    public ResponseEntity<Void> deleteRow(
            @PathVariable Long sheetId,
            @PathVariable Long rowId,
            @RequestParam Long requesterId) {
        defectService.deleteRow(sheetId, rowId, requesterId);
        return ResponseEntity.noContent().build();
    }

    @Operation(summary = "Get lightweight defect list for dropdown (by project)")
    @GetMapping("/dropdown")
    public ResponseEntity<List<DefectDTO.DropdownItem>> getDropdown(
            @RequestParam Long projectId) {
        return ResponseEntity.ok(defectService.getDropdownItems(projectId));
    }

    @Operation(summary = "Delete a defect sheet and all its rows")
    @DeleteMapping("/sheets/{sheetId}")
    public ResponseEntity<Void> deleteSheet(
            @PathVariable Long sheetId,
            @RequestParam Long requesterId) {
        defectService.deleteSheet(sheetId, requesterId);
        return ResponseEntity.noContent().build();
    }
}
