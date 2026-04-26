package com.anirudh.testmanagement.oneportal.repository;

import com.anirudh.testmanagement.oneportal.entity.TestExecution;
import com.anirudh.testmanagement.oneportal.entity.TestExecution.ExecutionStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface TestExecutionRepository extends JpaRepository<TestExecution, Long> {

    Page<TestExecution> findByTestCaseId(Long testCaseId, Pageable pageable);

    Page<TestExecution> findByExecutedById(Long userId, Pageable pageable);

    Page<TestExecution> findByExecutionStatus(ExecutionStatus executionStatus, Pageable pageable);

    List<TestExecution> findByTestCaseIdAndExecutionStatus(Long testCaseId, ExecutionStatus executionStatus);

    @Query("SELECT e.executionStatus, COUNT(e) FROM TestExecution e " +
           "WHERE e.testCase.id = :testCaseId GROUP BY e.executionStatus")
    List<Object[]> countByStatusForTestCase(@Param("testCaseId") Long testCaseId);

    @Query("SELECT e.executionStatus, COUNT(e) FROM TestExecution e " +
           "WHERE e.executedBy.id = :userId GROUP BY e.executionStatus")
    List<Object[]> countByStatusForUser(@Param("userId") Long userId);
}
