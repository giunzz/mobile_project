# AI Smart Pet Feeder

Hệ thống máy cho thú cưng ăn thông minh sử dụng ESP32-S3 CAM, Edge AI, Firebase và React Native.

## Authors
Hoàng Ngọc Dung · Hoàng Mạnh Hùng · Phạm Quang Phúc · Trần Hữu Dương · Đoàn Minh Duy Bình
## Project Structure

```text
MOBILE_PROJECT/
├── AI_model/      # Training, evaluation và tối ưu mô hình AI
├── backend/       # Firebase, API và xử lý dữ liệu
├── deployment/    # Model conversion và deployment
├── ESP32/         # Firmware, camera, servo, load cell và AI inference
├── frontend/      # React Native mobile application
└── README.md


Dataset 
The Oxford-IIIT Pet Dataset https://share.google/MxtJ1Apxho7LpQxAX
The Oxford-IIIT Pet Dataset is a 37 category pet dataset with roughly 200 images for each class created by the Visual Geometry Group at Oxford.

🐶Pet's Facial Expression Image Dataset😸 https://share.google/GDuKILRMFBLTyGunB
This dataset contains 1000 face images of various pets, such as dogs, cats, rabbits, hamsters, sheep, horses, and birds.