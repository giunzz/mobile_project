import os

input_file = "csunet_ssr_s3_deploy_float32.tflite"
output_file = "model.h"

with open(input_file, "rb") as f:
    data = f.read()

with open(output_file, "w") as f:
    f.write("#ifndef MODEL_H\n#define MODEL_H\n\n")
    # alignas(8) cực kỳ quan trọng để ESP32-S3 không bị lỗi Memory Alignment
    f.write("alignas(8) const unsigned char model_tflite[] = {\n")
    
    for i, byte in enumerate(data):
        f.write(f"0x{byte:02x}, ")
        if (i + 1) % 12 == 0:
            f.write("\n")
            
    f.write("\n};\n")
    f.write(f"const unsigned int model_tflite_len = {len(data)};\n\n")
    f.write("#endif\n")

print(f" Đã xuất file {output_file} thành công! Kích thước: {len(data)} bytes.")