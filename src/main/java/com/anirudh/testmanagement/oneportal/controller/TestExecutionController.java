package com.anirudh.testmanagement.oneportal.controller;

import com.anirudh.testmanagement.oneportal.dto.TestExecutionDTO;
import com.anirudh.testmanagement.oneportal.entity.TestExecution.ExecutionStatus;
import com.anirudh.testmanagement.oneportal.service.TestExecutionService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/test-executions")
@RequiredArgsConstructor
@Tag(name = "Test Executions", description = "Test execution management endpoints")
public class TestExecutionController {

    private final TestExecutionService executionService;

    @GetMapping
    @Operation(summary = "List all executions (paginated)")
    public Page<TestExecutionDTO.Response> findAll(@PageableDefault(size = 20) Pageable pageable) {
        return executionService.findAll(pageable);
    }

    @GetMapping("/by-test-case/{testCaseId}")
    @Operation(summary = "List executions for a specific test case")
    public Page<TestExecutionDTO.Response> findByTestCase(@PathVariable Long testCaseId,
                                                           @PageableDefault(size = 20) Pageable pageable) {
        return executionService.findByTestCase(testCaseId, pageable);
    }

    @GetMapping("/by-user/{userId}")
    @Operation(summary = "List executions performed by a specific user")
    public Page<TestExecutionDTO.Response> findByUser(@PathVariable Long userId,
                                                       @PageableDefault(size = 20) Pageable pageable) {
        return executionService.findByUser(userId, pageable);
    }

    @GetMapping("/by-status/{status}")
    @Operation(summary = "Filter executions by status")
    public Page<TestExecutionDTO.Response> findByStatus(@PathVariable ExecutionStatus status,
                                                         @PageableDefault(size = 20) Pageable pageable) {
        return executionService.findByStatus(status, pageable);
    }

    @GetMapping("/{id}")
    @Operation(summary = "Get a single execution by ID")
    public TestExecutionDTO.Response findById(@PathVariable Long id) {
        return executionService.findById(id);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Start a new test execution")
    public TestExecutionDTO.Response create(@RequestParam Long executorId,
                                             @Valid @RequestBody TestExecutionDTO.CreateRequest request) {
        return executionService.create(executorId, request);
    }

    @PatchMapping("/{id}")
    @Operation(summary = "Update execution result / status")
    public TestExecutionDTO.Response update(@PathVariable Long id,
                                             @Valid @RequestBody TestExecutionDTO.UpdateRequest request) {
        return executionService.update(id, request);
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "Delete an execution record")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        executionService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
