const React = require('react');

const Camera = React.forwardRef(() => null);
Camera.getCameraPermissionStatus = async () => 'granted';
Camera.requestCameraPermission = async () => 'granted';

module.exports = {
  Camera,
  useCameraDevice: () => null,
};
