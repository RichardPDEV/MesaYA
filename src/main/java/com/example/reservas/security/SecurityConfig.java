package com.example.reservas.security;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

@Configuration
@EnableMethodSecurity
public class SecurityConfig {
    private final JwtFilter jwtFilter;

    public SecurityConfig(JwtFilter jwtFilter) { this.jwtFilter = jwtFilter; }

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http.csrf().disable()
            .sessionManagement().sessionCreationPolicy(SessionCreationPolicy.STATELESS).and()
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/auth/**", "/v3/api-docs/**", "/swagger-ui/**", "/swagger-ui.html", "/actuator/health/**").permitAll()
                .requestMatchers(HttpMethod.POST, "/v1/businesses").authenticated()
                .requestMatchers(HttpMethod.PUT, "/v1/businesses/**").authenticated()
                .requestMatchers(HttpMethod.POST, "/v1/businesses/*/resources").authenticated()
                .requestMatchers(HttpMethod.POST, "/v1/reservations").hasAnyRole("USER", "OWNER")
                .requestMatchers(HttpMethod.PATCH, "/v1/reservations/**").hasAnyRole("USER", "OWNER")
                .anyRequest().permitAll()
            )
            .addFilterBefore(jwtFilter, UsernamePasswordAuthenticationFilter.class);
        return http.build();
    }
}
