#pragma once

#include <cstdint>

void ScrollMouse(std::uint8_t deltaMode, float deltaX, float deltaY, float deltaZ);
void SetMouseButton(std::uint8_t button, bool isDown);
void SetMousePosition(std::uint32_t absoluteX, std::uint32_t absoluteY);
void MoveMousePosition(std::int32_t deltaX, std::int32_t deltaY);