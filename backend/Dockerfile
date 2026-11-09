FROM ubuntu:22.04

# Install dependencies
RUN apt-get update && apt-get install -y \
	build-essential \
	cmake \
	git \
	postgresql-client \
	libopensdk-dev \
	libboost-all-dev \
	nlohmann-json3-dev \
	libpq-dev \
	&& rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy source code
COPY backend /app/backend
COPY CMakeLists.txt /app/

# Build
RUN mkdir -p build && cd build && \
	cmake -DCMAKE_BUILD_TYPE=Release .. && \
	make -j$(nproc)

EXPOSE 8443

CMD ["/app/build/bin/sfc_api"]
