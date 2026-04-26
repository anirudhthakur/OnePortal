package com.anirudh.testmanagement.oneportal.controller;

import com.anirudh.testmanagement.oneportal.dto.ReportDTO;
import com.anirudh.testmanagement.oneportal.service.ReportService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/reports")
@RequiredArgsConstructor
@Tag(name = "Reports")
public class ReportController {

    private final ReportService reportService;

    @Operation(summary = "Get full report data for a project")
    @GetMapping("/project/{projectId}/summary")
    public ResponseEntity<ReportDTO.ProjectReportSummary> getProjectReport(
            @PathVariable Long projectId,
            @RequestParam(defaultValue = "14") int trendDays) {
        return ResponseEntity.ok(reportService.getProjectReport(projectId, trendDays));
    }
}
