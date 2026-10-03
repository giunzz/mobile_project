import os
import sys

def convert_pt_to_tflite_and_header(pt_path="csunet_ssr_s3_best.pt", imgsz=128):
    print(f"[1/3] Đang nạp mô hình PyTorch từ {pt_path}...")
    try:
        from ultralytics import YOLO
        import ultralytics.nn.modules as modules
        import ultralytics.nn.tasks as tasks
        
        # Thêm thư mục hiện tại vào sys.path để nạp module/
        current_dir = os.path.dirname(os.path.abspath(__file__))
        if current_dir not in sys.path:
            sys.path.insert(0, current_dir)

        # Đăng ký các module ESP tùy biến vào ultralytics để tránh lỗi khi nạp .pt
        try:
            import module.esp_block as esp_block
            import module.esp_conv as esp_conv
            import module.esp_head as esp_head

            for name in getattr(esp_block, "__all__", []):
                setattr(modules, name, getattr(esp_block, name))
            if hasattr(esp_conv, "DSConv"):
                setattr(modules, "DSConv", esp_conv.DSConv)
            if hasattr(esp_head, "ESPDetect"):
                setattr(modules, "ESPDetect", esp_head.ESPDetect)
                setattr(tasks, "ESPDetect", esp_head.ESPDetect)
        except Exception as ex:
            print(f"[INFO] Bỏ qua đăng ký ESP module tùy biến: {ex}")

    except ImportError:
        print("[ERROR] Thư viện 'ultralytics' chưa được cài đặt!")
        print("Vui lòng chạy lệnh: pip install ultralytics tensorflow")
        sys.exit(1)

    if not os.path.exists(pt_path):
        print(f"[ERROR] Không tìm thấy file {pt_path}!")
        sys.exit(1)

    model = YOLO(pt_path)
    
    print(f"[2/3] Đang xuất mô hình sang TensorFlow Lite (kích thước {imgsz}x{imgsz})...")
    # Xuất mô hình sang tflite
    exported_path = model.export(format="tflite", imgsz=imgsz)
    print(f"File tflite được tạo tại: {exported_path}")

    # Tìm file .tflite vừa sinh ra
    tflite_file = None
    if isinstance(exported_path, str) and exported_path.endswith(".tflite"):
        tflite_file = exported_path
    elif isinstance(exported_path, str) and os.path.isdir(exported_path):
        for f in os.listdir(exported_path):
            if f.endswith(".tflite"):
                tflite_file = os.path.join(exported_path, f)
                break
    else:
        base_name = os.path.splitext(pt_path)[0]
        possible_dirs = [f"{base_name}_saved_model", f"{base_name}_tflite"]
        for p_dir in possible_dirs:
            if os.path.exists(p_dir):
                for f in os.listdir(p_dir):
                    if f.endswith(".tflite"):
                        tflite_file = os.path.join(p_dir, f)
                        break

    if not tflite_file or not os.path.exists(tflite_file):
        print("[ERROR] Không tìm thấy file .tflite sau khi export!")
        sys.exit(1)

    print(f"[3/3] Đang chuyển đổi {tflite_file} sang mảng C Header (model.h)...")
    with open(tflite_file, "rb") as f:
        data = f.read()

    header_path = "model.h"
    with open(header_path, "w") as f:
        f.write("#pragma once\n\n")
        f.write(f"// Generated from {pt_path} ({len(data)} bytes)\n")
        f.write(f"const unsigned char model_tflite[] = {{\n  ")
        lines = []
        for i in range(0, len(data), 16):
            chunk = data[i:i+16]
            lines.append(", ".join(f"0x{b:02x}" for b in chunk))
        f.write(",\n  ".join(lines))
        f.write(f"\n}};\n\nconst int model_tflite_len = {len(data)};\n")

    print(f"\n✅ THÀNH CÔNG! Đã tạo file: {os.path.abspath(header_path)} ({len(data)} bytes)")
    print("👉 Bây giờ bạn chỉ cần copy file 'model.h' này vào thư mục ESP32 và nạp lại code!")

if __name__ == "__main__":
    pt_file = "csunet_ssr_s3_best.pt"
    if len(sys.argv) > 1:
        pt_file = sys.argv[1]
    convert_pt_to_tflite_and_header(pt_file)
