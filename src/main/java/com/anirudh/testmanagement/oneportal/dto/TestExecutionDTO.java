package com.anirudh.testmanagement.oneportal.dto;

import com.anirudh.testmanagement.oneportal.entity.TestExecution.ExecutionStatus;
import jakarta.validation.constraints.NotNull;
import lombok.Builder;
import lombok.Value;

import java.time.LocalDateTime;

public class TestExecutionDTO {

    @Value
    @Builder
    public static class Response {
        Long id;
        Long testCaseId;
        String testCaseTitle;
        Long executedById;
        String executedByUsername;
        ExecutionStatus executionStatus;
        String actualResult;
        String comments;
        String buildVersion;
        String environment;
        Long durationMs;
        LocalDateTime startedAt;
        LocalDateTime finishedAt;
        LocalDateTime createdAt;
        LocalDateTime updatedAt;
    }

    @Value
    @Builder
    public static class CreateRequest {
        @NotNull
        Long testCaseId;

        String actualResult;
        String comments;
        String buildVersion;
        String environment;
        LocalDateTime startedAt;
    }

    @Value
    @Builder
    public static class UpdateRequest {
        ExecutionStatus executionStatus;
        String actualResult;
        String comments;
        String buildVersion;
        String environment;
        Long durationMs;
        LocalDateTime startedAt;
        LocalDateTime finishedAt;
    }
}
