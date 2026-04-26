package com.anirudh.testmanagement.oneportal.controller;

import com.anirudh.testmanagement.oneportal.dto.TestCaseDTO;
import com.anirudh.testmanagement.oneportal.entity.TestCase.Priority;
import com.anirudh.testmanagement.oneportal.entity.TestCase.Status;
import com.anirudh.testmanagement.oneportal.service.TestCaseService;
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
@RequestMapping("/api/v1/test-cases")
@RequiredArgsConstructor
@Tag(name = "Test Cases", description = "Test case management endpoints")
public class TestCaseController {

    private final TestCaseService testCaseService;

    @GetMapping
    @Operation(summary = "List all test cases (paginated)")
    public Page<TestCaseDTO.Response> findAll(@PageableDefault(size = 20) Pageable pageable) {
        return testCaseService.findAll(pageable);
    }

    @GetMapping("/search")
    @Operation(summary = "Search test cases by keyword in title or description")
    public Page<TestCaseDTO.Response> search(@RequestParam String keyword,
                                              @PageableDefault(size = 20) Pageable pageable) {
        return testCaseService.search(keyword, pageable);
    }

    @GetMapping("/by-status/{status}")
    @Operation(summary = "Filter test cases by status")
    public Page<TestCaseDTO.Response> findByStatus(@PathVariable Status status,
                                                    @PageableDefault(size = 20) Pageable pageable) {
        return testCaseService.findByStatus(status, pageable);
    }

    @GetMapping("/by-priority/{priority}")
    @Operation(summary = "Filter test cases by priority")
    public Page<TestCaseDTO.Response> findByPriority(@PathVariable Priority priority,
                                                      @PageableDefault(size = 20) Pageable pageable) {
        return testCaseService.findByPriority(priority, pageable);
    }

    @GetMapping("/{id}")
    @Operation(summary = "Get a test case by ID")
    public TestCaseDTO.Response findById(@PathVariable Long id) {
        return testCaseService.findById(id);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Create a new test case")
    public TestCaseDTO.Response create(@RequestParam Long creatorId,
                                        @Valid @RequestBody TestCaseDTO.CreateRequest request) {
        return testCaseService.create(creatorId, request);
    }

    @PatchMapping("/{id}")
    @Operation(summary = "Update a test case")
    public TestCaseDTO.Response update(@PathVariable Long id,
                                        @Valid @RequestBody TestCaseDTO.UpdateRequest request) {
        return testCaseService.update(id, request);
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "Delete a test case")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        testCaseService.delete(id);
        return ResponseEntity.noContent().build();
    }

    @PatchMapping("/{id}/assign")
    @Operation(summary = "Assign a test case to a tester (project OWNER only)")
    public TestCaseDTO.Response assign(@PathVariable Long id,
                                       @RequestParam Long assigneeId,
                                       @RequestParam Long requesterId) {
        return testCaseService.assignTestCase(id, assigneeId, requesterId);
    }
}
