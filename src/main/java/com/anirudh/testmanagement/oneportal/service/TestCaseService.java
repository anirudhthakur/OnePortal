package com.anirudh.testmanagement.oneportal.service;

import com.anirudh.testmanagement.oneportal.dto.TestCaseDTO;
import com.anirudh.testmanagement.oneportal.entity.Project;
import com.anirudh.testmanagement.oneportal.entity.ProjectMember.ProjectRole;
import com.anirudh.testmanagement.oneportal.entity.TestCase;
import com.anirudh.testmanagement.oneportal.entity.TestCase.Priority;
import com.anirudh.testmanagement.oneportal.entity.TestCase.Status;
import com.anirudh.testmanagement.oneportal.entity.User;
import com.anirudh.testmanagement.oneportal.exception.ResourceNotFoundException;
import com.anirudh.testmanagement.oneportal.repository.ProjectMemberRepository;
import com.anirudh.testmanagement.oneportal.repository.ProjectRepository;
import com.anirudh.testmanagement.oneportal.repository.TestCaseRepository;
import com.anirudh.testmanagement.oneportal.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class TestCaseService {

    private final TestCaseRepository testCaseRepository;
    private final UserRepository userRepository;
    private final ProjectMemberRepository projectMemberRepository;
    private final ProjectRepository projectRepository;

    public Page<TestCaseDTO.Response> findAll(Pageable pageable) {
        return testCaseRepository.findAll(pageable).map(this::toResponse);
    }

    public Page<TestCaseDTO.Response> findByStatus(Status status, Pageable pageable) {
        return testCaseRepository.findByStatus(status, pageable).map(this::toResponse);
    }

    public Page<TestCaseDTO.Response> findByPriority(Priority priority, Pageable pageable) {
        return testCaseRepository.findByPriority(priority, pageable).map(this::toResponse);
    }

    public Page<TestCaseDTO.Response> search(String keyword, Pageable pageable) {
        return testCaseRepository.search(keyword, pageable).map(this::toResponse);
    }

    public TestCaseDTO.Response findById(Long id) {
        return toResponse(getOrThrow(id));
    }

    @Transactional
    public TestCaseDTO.Response create(Long creatorId, TestCaseDTO.CreateRequest request) {
        User creator = userRepository.findById(creatorId)
                .orElseThrow(() -> new ResourceNotFoundException("User", creatorId));

        Project project = null;
        if (request.getProjectId() != null) {
            project = projectRepository.findById(request.getProjectId())
                    .orElseThrow(() -> new ResourceNotFoundException("Project", request.getProjectId()));
        }

        TestCase testCase = TestCase.builder()
                .title(request.getTitle())
                .description(request.getDescription())
                .steps(request.getSteps())
                .expectedResult(request.getExpectedResult())
                .priority(request.getPriority() != null ? request.getPriority() : Priority.MEDIUM)
                .module(request.getModule())
                .tag(request.getTag())
                .createdBy(creator)
                .project(project)
                .build();
        return toResponse(testCaseRepository.save(testCase));
    }

    @Transactional
    public TestCaseDTO.Response update(Long id, TestCaseDTO.UpdateRequest request) {
        TestCase testCase = getOrThrow(id);
        if (request.getTitle() != null)          testCase.setTitle(request.getTitle());
        if (request.getDescription() != null)    testCase.setDescription(request.getDescription());
        if (request.getSteps() != null)          testCase.setSteps(request.getSteps());
        if (request.getExpectedResult() != null) testCase.setExpectedResult(request.getExpectedResult());
        if (request.getPriority() != null)       testCase.setPriority(request.getPriority());
        if (request.getStatus() != null)         testCase.setStatus(request.getStatus());
        if (request.getModule() != null)         testCase.setModule(request.getModule());
        if (request.getTag() != null)            testCase.setTag(request.getTag());
        return toResponse(testCaseRepository.save(testCase));
    }

    @Transactional
    public void delete(Long id) {
        testCaseRepository.delete(getOrThrow(id));
    }

    @Transactional
    public TestCaseDTO.Response assignTestCase(Long testCaseId, Long assigneeId, Long requesterId) {
        TestCase testCase = getOrThrow(testCaseId);

        if (testCase.getProject() == null) {
            throw new IllegalStateException("Test case is not linked to any project and cannot be assigned");
        }
        Long projectId = testCase.getProject().getId();

        projectMemberRepository.findByProjectIdAndUserId(projectId, requesterId)
                .filter(m -> m.getRole() == ProjectRole.OWNER)
                .orElseThrow(() -> new AccessDeniedException("Only project owners can assign test cases"));

        User assignee = userRepository.findById(assigneeId)
                .orElseThrow(() -> new ResourceNotFoundException("User", assigneeId));

        if (!projectMemberRepository.existsByProjectIdAndUserId(projectId, assigneeId)) {
            throw new IllegalArgumentException("Assignee is not a member of this project");
        }

        testCase.setAssignedTo(assignee);
        return toResponse(testCaseRepository.save(testCase));
    }

    private TestCase getOrThrow(Long id) {
        return testCaseRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("TestCase", id));
    }

    private TestCaseDTO.Response toResponse(TestCase tc) {
        return TestCaseDTO.Response.builder()
                .id(tc.getId())
                .title(tc.getTitle())
                .description(tc.getDescription())
                .steps(tc.getSteps())
                .expectedResult(tc.getExpectedResult())
                .priority(tc.getPriority())
                .status(tc.getStatus())
                .module(tc.getModule())
                .tag(tc.getTag())
                .createdById(tc.getCreatedBy() != null ? tc.getCreatedBy().getId() : null)
                .createdByUsername(tc.getCreatedBy() != null ? tc.getCreatedBy().getUsername() : null)
                .projectId(tc.getProject() != null ? tc.getProject().getId() : null)
                .projectName(tc.getProject() != null ? tc.getProject().getName() : null)
                .assignedToId(tc.getAssignedTo() != null ? tc.getAssignedTo().getId() : null)
                .assignedToUsername(tc.getAssignedTo() != null ? tc.getAssignedTo().getUsername() : null)
                .createdAt(tc.getCreatedAt())
                .updatedAt(tc.getUpdatedAt())
                .build();
    }
}
