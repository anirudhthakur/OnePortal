package com.anirudh.testmanagement.oneportal.dto;

import com.anirudh.testmanagement.oneportal.entity.User.Role;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Builder;
import lombok.Value;

import java.time.LocalDateTime;

public class UserDTO {

    @Value
    @Builder
    public static class Response {
        Long id;
        String username;
        String email;
        Role role;
        boolean enabled;
        LocalDateTime createdAt;
        LocalDateTime updatedAt;
    }

    @Value
    @Builder
    public static class CreateRequest {
        @NotBlank
        @Size(min = 3, max = 50)
        String username;

        @NotBlank
        @Email
        String email;

        @NotBlank
        @Size(min = 8, max = 100)
        String password;

        Role role;
    }

    @Value
    @Builder
    public static class UpdateRequest {
        @Email
        String email;

        @Size(min = 8, max = 100)
        String password;

        Role role;

        Boolean enabled;
    }
}
