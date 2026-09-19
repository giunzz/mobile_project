#pragma once

// Class labels mapping for the model's 2 output logits:
// Index 0: Cat
// Index 1: Dog
// (You can swap these definitions if your training dataset used 0 for Dog)
#define AI_CLASS_0 "cat"
#define AI_CLASS_1 "dog"

// Model input geometry
#define AI_INPUT_WIDTH 128
#define AI_INPUT_HEIGHT 128
#define AI_INPUT_CHANNELS 3
