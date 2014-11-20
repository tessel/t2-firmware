USB_PATH := deps/usb

$(TARGET)_SRC += $(USB_PATH)/samd/usb_samd.c
$(TARGET)_SRC += $(USB_PATH)/usb_requests.c
$(TARGET)_INCLUDE += -I $(USB_PATH)
