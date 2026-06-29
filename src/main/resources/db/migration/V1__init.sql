-- Creación de tablas iniciales para la API de reservas

CREATE TABLE business (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(100) NOT NULL,
  cuisine VARCHAR(255),
  address VARCHAR(255),
  phone VARCHAR(255),
  description TEXT,
  table_layout_json TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE TABLE resource (
  id BIGSERIAL PRIMARY KEY,
  business_id BIGINT NOT NULL REFERENCES business(id),
  name VARCHAR(255) NOT NULL,
  capacity INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE TABLE reservation (
  id BIGSERIAL PRIMARY KEY,
  resource_id BIGINT NOT NULL REFERENCES resource(id),
  customer_name VARCHAR(255) NOT NULL,
  customer_email VARCHAR(255) NOT NULL,
  party_size INTEGER NOT NULL,
  start_time TIMESTAMP WITH TIME ZONE NOT NULL,
  end_time TIMESTAMP WITH TIME ZONE NOT NULL,
  status VARCHAR(50) NOT NULL,
  cancellation_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE TABLE cancellation_policy (
  id BIGSERIAL PRIMARY KEY,
  business_id BIGINT NOT NULL REFERENCES business(id),
  free_before_minutes INTEGER NOT NULL,
  penalty_type VARCHAR(50) NOT NULL,
  penalty_amount DOUBLE PRECISION NOT NULL
);
