package com.anirudh.testmanagement.oneportal.service;

import com.anirudh.testmanagement.oneportal.dto.TestExecutionDTO;
import com.anirudh.testmanagement.oneportal.entity.TestCase;
import com.anirudh.testmanagement.oneportal.entity.TestExecution;
import com.anirudh.testmanagement.oneportal.entity.TestExecution.ExecutionStatus;
import com.anirudh.testmanagement.oneportal.entity.User;
import com.anirudh.testmanagement.oneportal.exception.ResourceNotFoundException;
import com.anirudh.testmanagement.oneportal.repository.TestCaseRepository;
import com.anirudh.testmanagement.oneportal.repository.TestExecutionRepository;
import com.anirudh.testmanagement.oneportal.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class TestExecutionService {

    private final TestExecutionRepository executionRepository;
    private final TestCaseRepository testCaseRepository;
    private final UserRepository userRepository;

    public Page<TestExecutionDTO.Response> findAll(Pageable pageable) {
        return executionRepository.findAll(pageable).map(this::toResponse);
    }

    public Page<TestExecutionDTO.Response> findByTestCase(Long testCaseId, Pageable pageable) {
        return executionRepository.findByTestCaseId(testCaseId, pageable).map(this::toResponse);
    }

    public Page<TestExecutionDTO.Response> findByUser(Long userId, Pageable pageable) {
        return executionRepository.findByExecutedById(userId, pageable).map(this::toResponse);
    }

    public Page<TestExecutionDTO.Response> findByStatus(ExecutionStatus status, Pageable pageable) {
        return executionRepository.findByExecutionStatus(status, pageable).map(this::toResponse);
    }

    public TestExecutionDTO.Response findById(Long id) {
        return toResponse(getOrThrow(id));
    }

    @Transactional
    public TestExecutionDTO.Response create(Long executorId, TestExecutionDTO.CreateRequest request) {
        TestCase testCase = testCaseRepository.findById(request.getTestCaseId())
                .orElseThrow(() -> new ResourceNotFoundException("TestCase", request.getTestCaseId()));
        User executor = userRepository.findById(executorId)
                .orElseThrow(() -> new ResourceNotFoundException("User", executorId));

        TestExecution execution = TestExecution.builder()
                .testCase(testCase)
                .executedBy(executor)
                .executionStatus(ExecutionStatus.PENDING)
                .actualResult(request.getActualResult())
                .comments(request.getComments())
                .buildVersion(request.getBuildVersion())
                .environment(request.getEnvironment())
                .startedAt(request.getStartedAt())
                .build();
        return toResponse(executionRepository.save(execution));
    }

    @Transactional
    public TestExecutionDTO.Response update(Long id, TestExecutionDTO.UpdateRequest request) {
        TestExecution execution = getOrThrow(id);
        if (request.getExecutionStatus() != null) execution.setExecutionStatus(request.getExecutionStatus());
        if (request.getActualResult() != null)    execution.setActualResult(request.getActualResult());
        if (request.getComments() != null)        execution.setComments(request.getComments());
        if (request.getBuildVersion() != null)    execution.setBuildVersion(request.getBuildVersion());
        if (request.getEnvironment() != null)     execution.setEnvironment(request.getEnvironment());
        if (request.getDurationMs() != null)      execution.setDurationMs(request.getDurationMs());
        if (request.getStartedAt() != null)       execution.setStartedAt(request.getStartedAt());
        if (request.getFinishedAt() != null)      execution.setFinishedAt(request.getFinishedAt());
        return toResponse(executionRepository.save(execution));
    }

    @Transactional
    public void delete(Long id) {
        executionRepository.delete(getOrThrow(id));
    }

    private TestExecution getOrThrow(Long id) {
        return executionRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("TestExecution", id));
    }

    private TestExecutionDTO.Response toResponse(TestExecution e) {
        return TestExecutionDTO.Response.builder()
                .id(e.getId())
                .testCaseId(e.getTestCase().getId())
                .testCaseTitle(e.getTestCase().getTitle())
                .executedById(e.getExecutedBy().getId())
                .executedByUsername(e.getExecutedBy().getUsername())
                .executionStatus(e.getExecutionStatus())
                .actualResult(e.getActualResult())
                .comments(e.getComments())
                .buildVersion(e.getBuildVersion())
                .environment(e.getEnvironment())
                .durationMs(e.getDurationMs())
                .startedAt(e.getStartedAt())
                .finishedAt(e.getFinishedAt())
                .createdAt(e.getCreatedAt())
                .updatedAt(e.getUpdatedAt())
                .build();
    }
}
