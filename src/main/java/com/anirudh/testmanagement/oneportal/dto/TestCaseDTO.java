package com.anirudh.testmanagement.oneportal.dto;

import com.anirudh.testmanagement.oneportal.entity.TestCase.Priority;
import com.anirudh.testmanagement.oneportal.entity.TestCase.Status;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Builder;
import lombok.Value;

import java.time.LocalDateTime;

public class TestCaseDTO {

    @Value
    @Builder
    public static class Response {
        Long id;
        String title;
        String description;
        String steps;
        String expectedResult;
        Priority priority;
        Status status;
        String module;
        String tag;
        Long createdById;
        String createdByUsername;
        Long projectId;
        String projectName;
        Long assignedToId;
        String assignedToUsername;
        LocalDateTime createdAt;
        LocalDateTime updatedAt;
    }

    @Value
    @Builder
    public static class CreateRequest {
        @NotBlank
        @Size(min = 3, max = 255)
        String title;

        String description;
        String steps;
        String expectedResult;
        Priority priority;
        String module;
        String tag;
        Long projectId;
    }

    @Value
    @Builder
    public static class UpdateRequest {
        @Size(min = 3, max = 255)
        String title;

        String description;
        String steps;
        String expectedResult;
        Priority priority;
        Status status;
        String module;
        String tag;
    }
}
