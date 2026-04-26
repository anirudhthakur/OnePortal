package com.anirudh.testmanagement.oneportal.repository;

import com.anirudh.testmanagement.oneportal.entity.TestCase;
import com.anirudh.testmanagement.oneportal.entity.TestCase.Priority;
import com.anirudh.testmanagement.oneportal.entity.TestCase.Status;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface TestCaseRepository extends JpaRepository<TestCase, Long> {

    Page<TestCase> findByStatus(Status status, Pageable pageable);

    Page<TestCase> findByPriority(Priority priority, Pageable pageable);

    Page<TestCase> findByCreatedById(Long userId, Pageable pageable);

    List<TestCase> findByModule(String module);

    @Query("SELECT t FROM TestCase t WHERE " +
           "LOWER(t.title) LIKE LOWER(CONCAT('%', :keyword, '%')) OR " +
           "LOWER(t.description) LIKE LOWER(CONCAT('%', :keyword, '%'))")
    Page<TestCase> search(@Param("keyword") String keyword, Pageable pageable);
}
