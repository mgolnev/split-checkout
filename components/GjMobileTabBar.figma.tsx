import figma from "@figma/code-connect/react";
import { GjMobileTabBar } from "./GjMobileTabBar";

const url =
  "https://www.figma.com/design/UPMl36HuGIqeJhV0CVW4VD/Untitled?node-id=1102-263";

figma.connect(GjMobileTabBar, url, {
  example: () => (
    <GjMobileTabBar
      active="catalog"
      cartCount={10}
      favoritesCount={6}
      showProfileDot
    />
  ),
});
