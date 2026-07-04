package com.example.reservas.repo;

import com.example.reservas.domain.Reservation;
import com.example.reservas.domain.ReservationStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.time.OffsetDateTime;
import java.util.List;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

public interface ReservationRepository extends JpaRepository<Reservation, Long> {

    @Query("""
      select r from Reservation r
      where r.resource.id = :resourceId
        and r.status = com.example.reservas.domain.ReservationStatus.CONFIRMED
        and r.startTime < :end
        and r.endTime > :start
      """)
    List<Reservation> findOverlaps(Long resourceId, OffsetDateTime start, OffsetDateTime end);

    @Query("""
      select r from Reservation r
      where r.resource.id = :resourceId
        and r.startTime >= :start
        and r.startTime < :end
      order by r.startTime asc
      """)
    List<Reservation> findForDay(Long resourceId, OffsetDateTime start, OffsetDateTime end);

    @Query("""
      select r from Reservation r
      where r.resource.id = :resourceId
        and r.startTime >= :start
        and r.startTime < :end
      order by r.startTime asc
      """)
    Page<Reservation> findForDayPage(Long resourceId, OffsetDateTime start, OffsetDateTime end, Pageable pageable);

    List<Reservation> findByUserId(Long userId);

    long countByResourceIdAndStatus(Long resourceId, ReservationStatus status);
}