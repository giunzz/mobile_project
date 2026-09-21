import tensorflow as tf
import numpy as np

# Nạp thư viện
import onnx2tf
import onnx2tf.onnx2tf as onnx2tf_core

# Vá lỗi triệt để: Tráo đổi hàm tải ảnh trực tiếp trong bộ nhớ của file lõi
onnx2tf_core.download_test_image_data = lambda *args, **kwargs: np.zeros((1, 3, 128, 128), dtype=np.float32)

print("Bắt đầu chuyển đổi ONNX sang SavedModel...")
# 1. Chuyển ONNX sang TensorFlow SavedModel
onnx2tf.convert(
    input_onnx_file_path="csunet_ssr_s3_deploy.onnx", # Hãy chắc chắn file là model.onnx
    output_folder_path="saved_model"
)

print("Bắt đầu tối ưu hóa và xuất file TFLite...")
# 2. Chuyển SavedModel sang TFLite và nén
converter = tf.lite.TFLiteConverter.from_saved_model("saved_model")
converter.optimizations = [tf.lite.Optimize.DEFAULT] 
tflite_model = converter.convert()

# 3. Xuất file tflite
with open("model.tflite", "wb") as f:
    f.write(tflite_model)
    
print(" Đã xuất file model.tflite thành công!")