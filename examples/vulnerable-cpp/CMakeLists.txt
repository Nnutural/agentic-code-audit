cmake_minimum_required(VERSION 3.16)
project(agentic_vulnerable_cpp LANGUAGES CXX)

add_executable(vulnerable_cpp main.cpp)
target_compile_features(vulnerable_cpp PRIVATE cxx_std_17)
