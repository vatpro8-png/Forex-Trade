cmake_minimum_required(VERSION 3.20)
project(SFCapitalFXBackend)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Find required packages
find_package(PostgreSQL REQUIRED)
find_package(nlohmann_json REQUIRED)
find_package(OpenSSL REQUIRED)
find_package(Boost REQUIRED COMPONENTS system)

# Include directories
include_directories(
	${CMAKE_CURRENT_SOURCE_DIR}/include
	${PostgreSQL_INCLUDE_DIRS}
)

# Source files
file(GLOB_RECURSE SOURCES "src/*.cpp")
file(GLOB_RECURSE HEADERS "include/*.hpp")

# Create the executable
add_executable(sfc_api ${SOURCES} ${HEADERS})

# Link libraries
target_link_libraries(sfc_api
	${PostgreSQL_LIBRARIES}
	nlohmann_json::nlohmann_json
	OpenSSL::SSL
	OpenSSL::Crypto
	Boost::system
)

# Compiler flags
if(MSVC)
	target_compile_options(sfc_api PRIVATE /W4)
else()
	target_compile_options(sfc_api PRIVATE -Wall -Wextra -Wpedantic)
endif()

# Output directory
set_target_properties(sfc_api PROPERTIES
	RUNTIME_OUTPUT_DIRECTORY "${CMAKE_BINARY_DIR}/bin"
)
