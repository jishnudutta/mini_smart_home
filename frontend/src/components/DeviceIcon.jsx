import { iconForDevice } from '../utils/deviceIcons'

export default function DeviceIcon({ device, size = 17, ...props }) {
  const Icon = iconForDevice(device)
  return <Icon size={size} strokeWidth={1.75} aria-hidden="true" {...props} />
}
