package com.example.reservas.web.error;

import com.example.reservas.service.NotFoundException;
import com.example.reservas.service.ValidationException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.time.OffsetDateTime;
import java.util.HashMap;
import java.util.Map;

@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(NotFoundException.class)
    public ResponseEntity<ApiError> handleNotFound(NotFoundException ex, org.springframework.web.context.request.WebRequest req) {
        return build(HttpStatus.NOT_FOUND, "NOT_FOUND", ex.getMessage(), req, null);
    }

    @ExceptionHandler(ValidationException.class)
    public ResponseEntity<ApiError> handleValidation(ValidationException ex, org.springframework.web.context.request.WebRequest req) {
        return build(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", ex.getMessage(), req, null);
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiError> handleBeanValidation(MethodArgumentNotValidException ex, org.springframework.web.context.request.WebRequest req) {
        Map<String, String> details = new HashMap<>();
        for (var error : ex.getBindingResult().getAllErrors()) {
            String field = error instanceof FieldError fe ? fe.getField() : error.getObjectName();
            details.put(field, error.getDefaultMessage());
        }
        return build(HttpStatus.BAD_REQUEST, "BEAN_VALIDATION", "Validación de request fallida", req, details);
    }

    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<ApiError> handleDb(DataIntegrityViolationException ex, org.springframework.web.context.request.WebRequest req) {
        return build(HttpStatus.CONFLICT, "DB_CONSTRAINT", "Violación de restricción de datos", req, null);
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiError> handleOthers(Exception ex, org.springframework.web.context.request.WebRequest req) {
        log.error("Error inesperado al procesar petición: {}", req.getDescription(false), ex);
        Map<String, String> details = new HashMap<>();
        details.put("exception", ex.getClass().getName());
        details.put("message", ex.getMessage());
        if (ex.getCause() != null) {
            details.put("cause", ex.getCause().getMessage());
        }
        return build(HttpStatus.INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", 
                "Error inesperado: " + ex.getClass().getSimpleName(), req, details);
    }

    private ResponseEntity<ApiError> build(HttpStatus status, String code, String message, org.springframework.web.context.request.WebRequest req, Map<String,String> details) {
        String path = req.getDescription(false).replace("uri=", "");
        if (details == null) {
            details = new HashMap<>();
        }
        String traceId = MDC.get("traceId");
        if (traceId != null && !traceId.isBlank()) {
            details.put("traceId", traceId);
        }
        ApiError body = new ApiError(OffsetDateTime.now().toString(), path, status.value(), code, message, details);
        return ResponseEntity.status(status).body(body);
    }
}
