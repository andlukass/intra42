import { NativeTabs } from "expo-router/unstable-native-tabs";
import { useState } from "react";
import { useProfile } from "../../src/api";
import { CircularTabAvatar, type TabAvatar } from "../../src/circular-tab-avatar";
import { teal } from "../../src/ui";
export default function IosTabs() {
  const profileImage = useProfile().data?.image;
  const avatar = profileImage?.versions?.small ?? profileImage?.link;
  const [image, setImage] = useState<TabAvatar>();
  const icon = image?.source === avatar ? image?.uri : undefined;
  return (
    <>
      {avatar && <CircularTabAvatar key={avatar} uri={avatar} onReady={setImage} />}
      <NativeTabs minimizeBehavior="never" tintColor={teal}>
        <NativeTabs.Trigger name="index" disableAutomaticContentInsets>
          <NativeTabs.Trigger.Icon sf={{ default: "house", selected: "house.fill" }} />
          <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="slots" disableAutomaticContentInsets>
          <NativeTabs.Trigger.Icon sf="calendar" />
          <NativeTabs.Trigger.Label>Slots</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="config" disableAutomaticContentInsets>
          {icon ? (
            <NativeTabs.Trigger.Icon
              src={{ uri: icon, width: 24, height: 24, scale: 3 }}
              renderingMode="original"
            />
          ) : (
            <NativeTabs.Trigger.Icon sf="person.crop.circle" />
          )}
          <NativeTabs.Trigger.Label>Config</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
      </NativeTabs>
    </>
  );
}
