package com.anirudh.testmanagement.oneportal.dto;

import com.anirudh.testmanagement.oneportal.entity.ProjectMember.ProjectRole;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Builder;
import lombok.Value;

import java.time.LocalDateTime;

public class ProjectDTO {

    @Value
    @Builder
    public static class Response {
        Long id;
        String name;
        String description;
        long memberCount;
        LocalDateTime createdAt;
        LocalDateTime updatedAt;
    }

    @Value
    @Builder
    public static class CreateRequest {
        @NotBlank
        @Size(min = 2, max = 100)
        String name;

        String description;
    }

    @Value
    @Builder
    public static class MemberResponse {
        Long userId;
        String username;
        String email;
        ProjectRole role;
        LocalDateTime joinedAt;
    }

    @Value
    @Builder
    public static class AddMemberRequest {
        @NotNull
        Long userId;

        @NotNull
        ProjectRole role;
    }
}
