package com.anirudh.testmanagement.oneportal.repository;

import com.anirudh.testmanagement.oneportal.entity.TestDesignSheet;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface TestDesignSheetRepository extends JpaRepository<TestDesignSheet, Long> {

    Page<TestDesignSheet> findAllByOrderByCreatedAtDesc(Pageable pageable);

    @Query("SELECT COUNT(r) FROM TestDesignRow r WHERE r.sheet.id = :sheetId")
    long countRowsBySheetId(@Param("sheetId") Long sheetId);

    Optional<TestDesignSheet> findByProjectId(Long projectId);
}
