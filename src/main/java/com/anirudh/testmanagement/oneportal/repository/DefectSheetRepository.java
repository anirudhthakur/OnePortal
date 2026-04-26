package com.anirudh.testmanagement.oneportal.repository;

import com.anirudh.testmanagement.oneportal.entity.DefectSheet;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface DefectSheetRepository extends JpaRepository<DefectSheet, Long> {

    Optional<DefectSheet> findByProjectId(Long projectId);

    boolean existsByProjectId(Long projectId);
}
