package com.anirudh.testmanagement.oneportal.controller;

import com.anirudh.testmanagement.oneportal.dto.ProjectDTO;
import com.anirudh.testmanagement.oneportal.service.ProjectService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/projects")
@RequiredArgsConstructor
@Tag(name = "Projects", description = "Project management and member assignment endpoints")
public class ProjectController {

    private final ProjectService projectService;

    @GetMapping
    @Operation(summary = "List all projects")
    public List<ProjectDTO.Response> findAll() {
        return projectService.findAll();
    }

    @GetMapping("/{id}")
    @Operation(summary = "Get a project by ID")
    public ProjectDTO.Response findById(@PathVariable Long id) {
        return projectService.findById(id);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Create a new project (creator becomes OWNER)")
    public ProjectDTO.Response create(@RequestParam Long ownerId,
                                      @Valid @RequestBody ProjectDTO.CreateRequest request) {
        return projectService.createProject(ownerId, request);
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "Delete a project (OWNER only)")
    public ResponseEntity<Void> delete(@PathVariable Long id,
                                       @RequestParam Long requesterId) {
        projectService.deleteProject(id, requesterId);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/{id}/members")
    @Operation(summary = "List all members of a project")
    public List<ProjectDTO.MemberResponse> getMembers(@PathVariable Long id) {
        return projectService.getMembers(id);
    }

    @PostMapping("/{id}/members")
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Add a member to a project (OWNER only)")
    public ProjectDTO.MemberResponse addMember(@PathVariable Long id,
                                               @RequestParam Long requesterId,
                                               @Valid @RequestBody ProjectDTO.AddMemberRequest request) {
        return projectService.addMember(id, requesterId, request);
    }

    @DeleteMapping("/{id}/members/{userId}")
    @Operation(summary = "Remove a member from a project (OWNER only)")
    public ResponseEntity<Void> removeMember(@PathVariable Long id,
                                             @PathVariable Long userId,
                                             @RequestParam Long requesterId) {
        projectService.removeMember(id, requesterId, userId);
        return ResponseEntity.noContent().build();
    }
}
