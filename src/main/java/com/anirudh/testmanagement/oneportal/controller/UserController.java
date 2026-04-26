package com.anirudh.testmanagement.oneportal.controller;

import com.anirudh.testmanagement.oneportal.dto.UserDTO;
import com.anirudh.testmanagement.oneportal.entity.User.Role;
import com.anirudh.testmanagement.oneportal.service.UserService;
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
@RequestMapping("/api/v1/users")
@RequiredArgsConstructor
@Tag(name = "Users", description = "User management endpoints")
public class UserController {

    private final UserService userService;

    @GetMapping
    @Operation(summary = "List all active users (paginated)")
    public Page<UserDTO.Response> findAll(@PageableDefault(size = 200) Pageable pageable) {
        return userService.findAll(pageable);
    }

    @GetMapping("/pending")
    @Operation(summary = "List users pending approval (ADMIN only)")
    public Page<UserDTO.Response> findPending(@PageableDefault(size = 200) Pageable pageable) {
        return userService.findPending(pageable);
    }

    @GetMapping("/inactive")
    @Operation(summary = "List deactivated (soft-deleted) users (ADMIN only)")
    public Page<UserDTO.Response> findInactive(@PageableDefault(size = 200) Pageable pageable) {
        return userService.findInactive(pageable);
    }

    @GetMapping("/{id}")
    @Operation(summary = "Get a user by ID")
    public UserDTO.Response findById(@PathVariable Long id) {
        return userService.findById(id);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Create a new user (admin direct-create, sets enabled=true)")
    public UserDTO.Response create(@Valid @RequestBody UserDTO.CreateRequest request) {
        return userService.create(request);
    }

    @PatchMapping("/{id}")
    @Operation(summary = "Update a user")
    public UserDTO.Response update(@PathVariable Long id,
                                   @Valid @RequestBody UserDTO.UpdateRequest request) {
        return userService.update(id, request);
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "Delete a user")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        userService.delete(id);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{id}/approve")
    @Operation(summary = "Approve a pending user and assign their role (ADMIN only)")
    public UserDTO.Response approve(
            @PathVariable Long id,
            @RequestParam Long requesterId,
            @RequestParam Role role) {
        return userService.approve(id, role, requesterId);
    }
}
