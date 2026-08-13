#pragma once

#include <cstdint>

void ScrollMouse(uint8_t deltaMode, float deltaX, float deltaY, float deltaZ);
void SetMouseButton(uint8_t button, bool isDown);
void SetMousePosition(uint32_t absoluteX, uint32_t absoluteY);
void MoveMousePosition(int32_t deltaX, int32_t deltaY);