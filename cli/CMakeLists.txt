cmake_minimum_required(VERSION 3.25)

project(nylon
    VERSION 0.1.0
    DESCRIPTION "Nylon C++ CLI"
    LANGUAGES CXX
)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

if(MSVC)
    add_compile_options(/W4 /permissive- /utf-8 /Zc:__cplusplus)
    add_compile_definitions(NOMINMAX WIN32_LEAN_AND_MEAN _CRT_SECURE_NO_WARNINGS)
else()
    add_compile_options(-Wall -Wextra -Wpedantic)
endif()

find_package(CLI11 CONFIG REQUIRED)
find_package(ftxui CONFIG REQUIRED)
find_package(nlohmann_json CONFIG REQUIRED)
find_package(tomlplusplus CONFIG REQUIRED)
find_package(reproc++ CONFIG REQUIRED)

set(NYLON_SOURCES
    src/main.cpp
    src/cli/args.cpp
    src/cli/output.cpp
    src/cli/ui.cpp
    src/config/config.cpp
    src/ipc/ndjson.cpp
    src/ipc/node_process.cpp
)

add_executable(nylon ${NYLON_SOURCES})

target_include_directories(nylon PRIVATE src)

target_link_libraries(nylon PRIVATE
    CLI11::CLI11
    ftxui::screen
    ftxui::dom
    ftxui::component
    nlohmann_json::nlohmann_json
    tomlplusplus::tomlplusplus
    reproc++
)

target_compile_definitions(nylon PRIVATE
    NYLON_VERSION="${PROJECT_VERSION}"
)

if(WIN32)
    target_compile_definitions(nylon PRIVATE NYLON_PLATFORM_WINDOWS=1)
elseif(APPLE)
    target_compile_definitions(nylon PRIVATE NYLON_PLATFORM_MACOS=1)
else()
    target_compile_definitions(nylon PRIVATE NYLON_PLATFORM_LINUX=1)
endif()

install(TARGETS nylon RUNTIME DESTINATION .)

enable_testing()
if(EXISTS "${CMAKE_CURRENT_SOURCE_DIR}/tests/CMakeLists.txt")
    add_subdirectory(tests)
endif()
