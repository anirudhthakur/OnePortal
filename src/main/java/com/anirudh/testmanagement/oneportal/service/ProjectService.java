package com.anirudh.testmanagement.oneportal.service;

import com.anirudh.testmanagement.oneportal.dto.ProjectDTO;
import com.anirudh.testmanagement.oneportal.entity.Project;
import com.anirudh.testmanagement.oneportal.entity.ProjectMember;
import com.anirudh.testmanagement.oneportal.entity.ProjectMember.ProjectRole;
import com.anirudh.testmanagement.oneportal.entity.User;
import com.anirudh.testmanagement.oneportal.exception.ResourceNotFoundException;
import com.anirudh.testmanagement.oneportal.repository.ProjectMemberRepository;
import com.anirudh.testmanagement.oneportal.repository.ProjectRepository;
import com.anirudh.testmanagement.oneportal.repository.TestDesignRowRepository;
import com.anirudh.testmanagement.oneportal.repository.TestDesignSheetRepository;
import com.anirudh.testmanagement.oneportal.repository.UserRepository;
import com.anirudh.testmanagement.oneportal.service.DefectService;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class ProjectService {

    private final ProjectRepository projectRepository;
    private final ProjectMemberRepository memberRepository;
    private final UserRepository userRepository;
    private final TestDesignSheetRepository sheetRepository;
    private final TestDesignRowRepository rowRepository;
    private final DefectService defectService;

    public List<ProjectDTO.Response> findAll() {
        return projectRepository.findAll().stream().map(this::toResponse).toList();
    }

    public ProjectDTO.Response findById(Long id) {
        return toResponse(getOrThrow(id));
    }

    @Transactional
    public ProjectDTO.Response createProject(Long ownerId, ProjectDTO.CreateRequest request) {
        User owner = userRepository.findById(ownerId)
                .orElseThrow(() -> new ResourceNotFoundException("User", ownerId));

        Project project = Project.builder()
                .name(request.getName())
                .description(request.getDescription())
                .build();
        project = projectRepository.save(project);

        ProjectMember ownerMember = ProjectMember.builder()
                .project(project)
                .user(owner)
                .role(ProjectRole.OWNER)
                .build();
        memberRepository.save(ownerMember);

        return toResponse(project);
    }

    @Transactional
    public void deleteProject(Long projectId, Long requesterId) {
        Project project = getOrThrow(projectId);

        User requester = userRepository.findById(requesterId)
                .orElseThrow(() -> new ResourceNotFoundException("User", requesterId));
        boolean isGlobalAdmin = requester.getRole() == User.Role.ADMIN;
        boolean isOwner = memberRepository.findByProjectIdAndUserId(projectId, requesterId)
                .map(m -> m.getRole() == ProjectRole.OWNER)
                .orElse(false);

        if (!isGlobalAdmin && !isOwner) {
            throw new AccessDeniedException("Only the project OWNER or a global ADMIN can delete a project");
        }

        // Cascade: delete defect sheet, test design sheet rows before the project
        defectService.deleteSheetByProject(projectId);
        sheetRepository.findByProjectId(projectId).ifPresent(sheet -> {
            rowRepository.deleteLinkedDefectsBySheetId(sheet.getId());
            rowRepository.deleteBySheetId(sheet.getId());
            sheetRepository.delete(sheet);
        });

        projectRepository.delete(project);
    }

    public List<ProjectDTO.MemberResponse> getMembers(Long projectId) {
        getOrThrow(projectId);
        return memberRepository.findByProjectId(projectId).stream()
                .map(this::toMemberResponse)
                .toList();
    }

    @Transactional
    public ProjectDTO.MemberResponse addMember(Long projectId, Long requesterId, ProjectDTO.AddMemberRequest request) {
        requireOwner(projectId, requesterId);

        getOrThrow(projectId);
        User user = userRepository.findById(request.getUserId())
                .orElseThrow(() -> new ResourceNotFoundException("User", request.getUserId()));

        if (memberRepository.existsByProjectIdAndUserId(projectId, request.getUserId())) {
            throw new IllegalArgumentException("User is already a member of this project");
        }

        Project project = getOrThrow(projectId);
        ProjectMember member = ProjectMember.builder()
                .project(project)
                .user(user)
                .role(request.getRole())
                .build();
        return toMemberResponse(memberRepository.save(member));
    }

    @Transactional
    public void removeMember(Long projectId, Long requesterId, Long userId) {
        requireOwner(projectId, requesterId);
        getOrThrow(projectId);

        if (!memberRepository.existsByProjectIdAndUserId(projectId, userId)) {
            throw new ResourceNotFoundException("ProjectMember", userId);
        }
        memberRepository.deleteByProjectIdAndUserId(projectId, userId);
    }

    void requireOwner(Long projectId, Long requesterId) {
        ProjectMember requester = memberRepository.findByProjectIdAndUserId(projectId, requesterId)
                .orElseThrow(() -> new AccessDeniedException("Not a member of this project"));
        if (requester.getRole() != ProjectRole.OWNER) {
            throw new AccessDeniedException("Only project owners can perform this action");
        }
    }

    private Project getOrThrow(Long id) {
        return projectRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Project", id));
    }

    private ProjectDTO.Response toResponse(Project p) {
        return ProjectDTO.Response.builder()
                .id(p.getId())
                .name(p.getName())
                .description(p.getDescription())
                .memberCount(memberRepository.findByProjectId(p.getId()).size())
                .createdAt(p.getCreatedAt())
                .updatedAt(p.getUpdatedAt())
                .build();
    }

    private ProjectDTO.MemberResponse toMemberResponse(ProjectMember m) {
        return ProjectDTO.MemberResponse.builder()
                .userId(m.getUser().getId())
                .username(m.getUser().getUsername())
                .email(m.getUser().getEmail())
                .role(m.getRole())
                .joinedAt(m.getJoinedAt())
                .build();
    }
}
