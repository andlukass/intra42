import { NativeTabs } from "expo-router/unstable-native-tabs";
import { useState } from "react";
import { useProfileAvatar } from "../../src/api";
import { CircularTabAvatar, type TabAvatar } from "../../src/circular-tab-avatar";
import { teal } from "../../src/ui";
export default function IosTabs() {
  const avatar = useProfileAvatar();
  const [image, setImage] = useState<TabAvatar>();
  const icon = image?.source === avatar ? image?.uri : undefined;
  return (
    <>
      {avatar && <CircularTabAvatar key={avatar} uri={avatar} onReady={setImage} />}
      <NativeTabs minimizeBehavior="never" tintColor={teal}>
        <NativeTabs.Trigger name="index" disableAutomaticContentInsets>
          {icon ? (
            <NativeTabs.Trigger.Icon
              src={{ uri: icon, width: 24, height: 24, scale: 3 }}
              renderingMode="original"
            />
          ) : (
            <NativeTabs.Trigger.Icon
              sf={{ default: "person.crop.circle", selected: "person.crop.circle.fill" }}
            />
          )}
          <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="projects" disableAutomaticContentInsets>
          <NativeTabs.Trigger.Icon
            src={require("../../assets/projects-tab.png")}
            renderingMode="template"
          />
          <NativeTabs.Trigger.Label>Projects</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="slots" disableAutomaticContentInsets>
          <NativeTabs.Trigger.Icon sf="calendar" />
          <NativeTabs.Trigger.Label>Slots</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="clusters" disableAutomaticContentInsets>
          <NativeTabs.Trigger.Icon sf="map" />
          <NativeTabs.Trigger.Label>Clusters</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="search" role="search" disableAutomaticContentInsets>
          <NativeTabs.Trigger.Icon sf="magnifyingglass" />
          <NativeTabs.Trigger.Label>Search</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
      </NativeTabs>
    </>
  );
}
