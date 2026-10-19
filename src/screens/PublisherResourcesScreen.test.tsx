import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";

import { PublisherResourcesScreen } from "./PublisherResourcesScreen";
import {
  fetchPublisherResources,
  getStoredApiKey,
} from "../api/resources";
import type { Resource } from "../types";

jest.mock("../api/resources", () => ({
  fetchPublisherResources: jest.fn(),
  getStoredApiKey: jest.fn(),
  storeApiKey: jest.fn(),
  deleteStoredApiKey: jest.fn(),
  getApiBaseUrl: jest.fn(() => "https://api.mindvault.test"),
}));

jest.mock("../components/SkeletonCard", () => ({
  SkeletonCard: () => null,
}));

jest.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));

const mockNavigation = {
  navigate: jest.fn(),
  popToTop: jest.fn(),
  goBack: jest.fn(),
};

jest.mock("@react-navigation/native", () => ({
  useNavigation: () => mockNavigation,
}));

jest.mock("../components/RegisterModal", () => {
  const { Text, Pressable, View } = require("react-native");
  return {
    RegisterModal: ({ visible, resource, onClose, onSuccess, onError }: any) => {
      if (!visible || !resource) return null;
      return (
        <View testID="register-modal">
          <Text testID="register-modal-title">Register Modal: {resource.title}</Text>
          <Pressable
            testID="mock-register-success-btn"
            accessibilityLabel="Trigger success"
            onPress={() => onSuccess("Registration successful!", "tx-mock-123456")}
          />
          <Pressable
            testID="mock-register-error-btn"
            accessibilityLabel="Trigger error"
            onPress={() => onError("Registration failed: server error")}
          />
          <Pressable
            testID="mock-register-close-btn"
            accessibilityLabel="Close register modal"
            onPress={onClose}
          />
        </View>
      );
    },
  };
});

jest.mock("../theme/ThemeProvider", () => {
  const colors = {
    primary: "#6366f1",
    primaryMuted: "#e0e7ff",
    surface: "#ffffff",
    border: "#e2e8f0",
    text: "#0f172a",
    textMuted: "#64748b",
    textSubtle: "#94a3b8",
    danger: "#ef4444",
    dangerBg: "#fee2e2",
    success: "#22c55e",
    successBg: "#dcfce7",
    warning: "#f59e0b",
    warningBg: "#fef3c7",
    neutralBg: "#f1f5f9",
    background: "#ffffff",
  };
  return {
    useAppTheme: () => ({
      colors,
      colorScheme: "light",
      shared: {
        screen: {},
        card: {},
        badge: {},
        badgeText: {},
        button: {},
        buttonText: {},
        primaryButton: {},
        primaryButtonText: {},
      },
      typography: {
        title: {},
        subtitle: {},
        heading: {},
        body: {},
        caption: {},
        price: {},
        cardTitle: {},
      },
    }),
  };
});

const mockedGetStoredApiKey = getStoredApiKey as jest.MockedFunction<typeof getStoredApiKey>;
const mockedFetchPublisherResources = fetchPublisherResources as jest.MockedFunction<
  typeof fetchPublisherResources
>;

function createResource(overrides: Partial<Resource>): Resource {
  return {
    id: overrides.id ?? "res-1",
    title: overrides.title ?? "Test Resource",
    price: overrides.price ?? "2.50",
    resourceType: overrides.resourceType ?? "file",
    publisherName: overrides.publisherName ?? "Alice",
    walletAddress: overrides.walletAddress ?? "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7",
    verificationStatus: overrides.verificationStatus ?? "verified",
    onchainStatus: overrides.onchainStatus ?? "none",
    listed: true,
    accessUrl: "https://example.com/file",
    ...overrides,
  };
}

describe("PublisherResourcesScreen - Register on-chain", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetStoredApiKey.mockResolvedValue("stored-test-key");
  });

  it("shows 'Register on-chain' only for verified resources whose onchainStatus is 'none' or 'failed'", async () => {
    const resVerifiedNone = createResource({
      id: "r1",
      title: "Verified None",
      verificationStatus: "verified",
      onchainStatus: "none",
    });
    const resVerifiedFailed = createResource({
      id: "r2",
      title: "Verified Failed",
      verificationStatus: "verified",
      onchainStatus: "failed",
    });
    const resVerifiedRegistered = createResource({
      id: "r3",
      title: "Verified Registered",
      verificationStatus: "verified",
      onchainStatus: "registered",
    });
    const resVerifiedPending = createResource({
      id: "r4",
      title: "Verified Pending",
      verificationStatus: "verified",
      onchainStatus: "pending",
    });
    const resPendingNone = createResource({
      id: "r5",
      title: "Pending None",
      verificationStatus: "pending",
      onchainStatus: "none",
    });
    const resRejectedNone = createResource({
      id: "r6",
      title: "Rejected None",
      verificationStatus: "rejected",
      onchainStatus: "none",
    });

    mockedFetchPublisherResources.mockResolvedValue([
      resVerifiedNone,
      resVerifiedFailed,
      resVerifiedRegistered,
      resVerifiedPending,
      resPendingNone,
      resRejectedNone,
    ]);

    const screen = render(<PublisherResourcesScreen />);

    // r1 and r2 must have register button
    const btnR1 = await screen.findByLabelText(`Register ${resVerifiedNone.title} on-chain`);
    expect(btnR1).toBeTruthy();
    expect(btnR1.props.accessibilityRole).toBe("button");

    const btnR2 = screen.getByLabelText(`Register ${resVerifiedFailed.title} on-chain`);
    expect(btnR2).toBeTruthy();
    expect(btnR2.props.accessibilityRole).toBe("button");

    // r3, r4, r5, r6 must NOT have register button
    expect(screen.queryByLabelText(`Register ${resVerifiedRegistered.title} on-chain`)).toBeNull();
    expect(screen.queryByLabelText(`Register ${resVerifiedPending.title} on-chain`)).toBeNull();
    expect(screen.queryByLabelText(`Register ${resPendingNone.title} on-chain`)).toBeNull();
    expect(screen.queryByLabelText(`Register ${resRejectedNone.title} on-chain`)).toBeNull();
  });

  it("opens RegisterModal on tap and updates the card to 'registered' with tx hash and toast on success", async () => {
    const res = createResource({
      id: "res-to-register",
      title: "My Exclusive Book",
      verificationStatus: "verified",
      onchainStatus: "none",
    });

    mockedFetchPublisherResources.mockResolvedValue([res]);

    const screen = render(<PublisherResourcesScreen />);

    const registerBtn = await screen.findByLabelText(`Register ${res.title} on-chain`);
    expect(screen.getByLabelText("On-chain: not on-chain")).toBeTruthy();

    // Tap the register button
    fireEvent.press(registerBtn);

    // Modal is now opened
    expect(screen.getByTestId("register-modal")).toBeTruthy();
    expect(screen.getByText(`Register Modal: ${res.title}`)).toBeTruthy();

    // Trigger success callback
    fireEvent.press(screen.getByTestId("mock-register-success-btn"));

    // Modal is closed
    await waitFor(() => expect(screen.queryByTestId("register-modal")).toBeNull());

    // Toast message is displayed
    expect(screen.getByText("Registration successful!")).toBeTruthy();

    // Card status is updated to registered
    expect(screen.getByLabelText("On-chain: registered")).toBeTruthy();

    // Card displays tx hash
    expect(screen.getByLabelText("Transaction: tx-mock-123456")).toBeTruthy();
    expect(screen.getByText(/Tx:\s+tx-moc…3456/)).toBeTruthy();

    // The register button is now gone for this card
    expect(screen.queryByLabelText(`Register ${res.title} on-chain`)).toBeNull();
  });

  it("surfaces server error message via toast when registration fails", async () => {
    const res = createResource({
      id: "res-error",
      title: "Error Resource",
      verificationStatus: "verified",
      onchainStatus: "failed",
    });

    mockedFetchPublisherResources.mockResolvedValue([res]);

    const screen = render(<PublisherResourcesScreen />);

    const registerBtn = await screen.findByLabelText(`Register ${res.title} on-chain`);
    fireEvent.press(registerBtn);

    expect(screen.getByTestId("register-modal")).toBeTruthy();

    // Trigger error callback
    fireEvent.press(screen.getByTestId("mock-register-error-btn"));

    // Toast with the extracted error message is shown
    expect(await screen.findByText("Registration failed: server error")).toBeTruthy();
  });

  it("closes RegisterModal without changes when cancel/close is pressed", async () => {
    const res = createResource({
      id: "res-cancel",
      title: "Cancel Resource",
      verificationStatus: "verified",
      onchainStatus: "none",
    });

    mockedFetchPublisherResources.mockResolvedValue([res]);

    const screen = render(<PublisherResourcesScreen />);

    const registerBtn = await screen.findByLabelText(`Register ${res.title} on-chain`);
    fireEvent.press(registerBtn);

    expect(screen.getByTestId("register-modal")).toBeTruthy();

    fireEvent.press(screen.getByTestId("mock-register-close-btn"));

    await waitFor(() => expect(screen.queryByTestId("register-modal")).toBeNull());
    expect(screen.getByLabelText("On-chain: not on-chain")).toBeTruthy();
  });
});
