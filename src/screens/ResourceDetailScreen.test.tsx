import * as Clipboard from "expo-clipboard";
import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { ActivityIndicator } from "react-native";

import { fetchResource, ResourceFetchError } from "../api/resources";
import { fetchVerification, type VerificationDetails } from "../api/verification";
import { shareResource } from "../utils/shareResource";
import { openExternalUrl } from "../utils/stellarExpert";
import { ResourceDetailScreen } from "./ResourceDetailScreen";

jest.mock("../api/resources", () => {
  const actual = jest.requireActual("../api/resources");
  return { ...actual, fetchResource: jest.fn() };
});
jest.mock("../api/verification", () => ({
  ...jest.requireActual("../api/verification"),
  fetchVerification: jest.fn(),
}));
jest.mock("expo-clipboard", () => ({ setStringAsync: jest.fn().mockResolvedValue(undefined) }));
jest.mock("../utils/shareResource", () => ({ shareResource: jest.fn().mockResolvedValue("shared") }));
jest.mock("../utils/stellarExpert", () => ({
  stellarExpertAccountUrl: jest.fn(() => "https://stellar.expert/account/owner"),
  stellarExpertTxUrl: jest.fn(() => "https://stellar.expert/tx/hash"),
  openExternalUrl: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock("../theme/ThemeProvider", () => {
  const colors = new Proxy({}, { get: () => "#000000" });
  return {
    ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
    useAppTheme: () => ({
      colors,
      shared: {
        screen: {}, button: {}, buttonText: {}, primaryButton: {}, primaryButtonText: {},
        badge: {}, badgeText: {},
      },
      typography: { subtitle: {}, title: {}, body: {}, price: {} },
    }),
  };
});

const mockedFetchResource = fetchResource as jest.MockedFunction<typeof fetchResource>;
const mockedFetchVerification = fetchVerification as jest.MockedFunction<typeof fetchVerification>;
const mockedShareResource = shareResource as jest.MockedFunction<typeof shareResource>;
const mockedOpenExternalUrl = openExternalUrl as jest.MockedFunction<typeof openExternalUrl>;

const resource = {
  id: "resource-1",
  title: "Stellar handbook",
  price: "4.50",
  resourceType: "file",
  publisherName: "MindVault",
  walletAddress: "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7",
  verificationStatus: "verified" as const,
  onchainStatus: "registered" as const,
  onchainTxHash: "abc123",
  listed: true,
  accessUrl: "https://example.com/resource-1",
  updatedAt: "2025-06-15T12:30:00.000Z",
};

const navigation = { setOptions: jest.fn(), goBack: jest.fn() } as any;
const route = { params: { resourceId: resource.id } } as any;

function renderScreen() {
  return render(<ResourceDetailScreen route={route} navigation={navigation} />);
}

/** A `GET /resources/:id/verification` response, as the server returns it. */
function makeVerification(
  overrides: Partial<VerificationDetails> = {}
): VerificationDetails {
  return {
    resourceId: "resource-1",
    title: "Doc",
    status: "verified",
    listed: true,
    publishedAt: "2025-06-01T09:00:00.000Z",
    verification: {
      isOriginal: true,
      confidence: 0.92,
      flags: [],
      checkedAt: "2025-06-15T12:30:00.000Z",
    },
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedShareResource.mockResolvedValue("shared");
  mockedOpenExternalUrl.mockResolvedValue(undefined);
  mockedFetchVerification.mockResolvedValue(makeVerification());
});

it("shows a spinner while the resource is loading", () => {
  mockedFetchResource.mockReturnValue(new Promise(() => {}));
  const screen = renderScreen();
  expect(screen.UNSAFE_getByType(ActivityIndicator)).toBeTruthy();
});

it("shows only Go Back for a permanent 404", async () => {
  mockedFetchResource.mockRejectedValue(new ResourceFetchError("Resource not found.", false));
  const screen = renderScreen();

  expect(await screen.findByText("Resource not found.")).toBeTruthy();
  expect(screen.getByText("Go Back")).toBeTruthy();
  expect(screen.queryByText("Try Again")).toBeNull();
  fireEvent.press(screen.getByText("Go Back"));
  expect(navigation.goBack).toHaveBeenCalled();
});

it("retries a transient network error and then renders the resource", async () => {
  mockedFetchResource
    .mockRejectedValueOnce(new ResourceFetchError("Network error.", true))
    .mockResolvedValueOnce(resource);
  const screen = renderScreen();

  fireEvent.press(await screen.findByText("Try Again"));
  expect(await screen.findByText(resource.title)).toBeTruthy();
  expect(mockedFetchResource).toHaveBeenCalledTimes(2);
});

it("renders title, price, status badges, and timestamp", async () => {
  mockedFetchResource.mockResolvedValue(resource);
  const screen = renderScreen();

  expect(await screen.findByText(resource.title)).toBeTruthy();
  expect(screen.getByText("4.50 USDC")).toBeTruthy();
  expect(screen.getByLabelText("Verification: verified")).toBeTruthy();
  expect(screen.getByLabelText("On-chain: registered")).toBeTruthy();
  expect(screen.getByText(/Last updated.*2025/)).toBeTruthy();
});

it("copies the access URL and shows a toast", async () => {
  mockedFetchResource.mockResolvedValue(resource);
  const screen = renderScreen();
  fireEvent.press(await screen.findByText("Copy Access URL"));

  await waitFor(() => expect(Clipboard.setStringAsync).toHaveBeenCalledWith(resource.accessUrl));
  expect(await screen.findByText("Resource URL copied")).toBeTruthy();
});

it("shares through the resource helper", async () => {
  mockedFetchResource.mockResolvedValue(resource);
  const screen = renderScreen();
  fireEvent.press(await screen.findByText("Share Access URL"));

  await waitFor(() =>
    expect(mockedShareResource).toHaveBeenCalledWith(resource.title, resource.accessUrl)
  );
});

it("shows a toast when opening Stellar Expert fails", async () => {
  mockedFetchResource.mockResolvedValue(resource);
  mockedOpenExternalUrl.mockRejectedValue(new Error("cannot open"));
  const screen = renderScreen();
  fireEvent.press(await screen.findByLabelText(`Owner: ${resource.walletAddress}`));

  expect(await screen.findByText("Unable to open explorer")).toBeTruthy();
});

describe("collapsible verification section", () => {
  it("can be expanded and collapsed with accessibility attributes", async () => {
    mockedFetchResource.mockResolvedValue(resource);
    const screen = renderScreen();

    await screen.findByText(resource.title);
    const header = screen.getByLabelText("Verification");
    expect(header.props.accessibilityState).toEqual({ expanded: false });
    expect(screen.queryByLabelText("Verification details")).toBeNull();

    fireEvent.press(header);
    expect(header.props.accessibilityState).toEqual({ expanded: true });
    expect(screen.getByLabelText("Verification details")).toBeTruthy();
    // Let the first-expand fetch settle inside the test.
    await screen.findByLabelText("Verification Status: verified");

    fireEvent.press(header);
    expect(header.props.accessibilityState).toEqual({ expanded: false });
    expect(screen.queryByLabelText("Verification details")).toBeNull();
  });

  it("shows loading state when verification details are fetching", async () => {
    mockedFetchResource.mockResolvedValue(resource);
    mockedFetchVerification.mockReturnValue(new Promise(() => {}));
    const screen = renderScreen();

    await screen.findByText(resource.title);
    fireEvent.press(screen.getByLabelText("Verification"));

    expect(screen.getByLabelText("Loading verification details")).toBeTruthy();
    expect(screen.getByText("Loading verification details…")).toBeTruthy();
  });

  it("renders status, originality, confidence, flags and the check time", async () => {
    mockedFetchResource.mockResolvedValue(resource);
    mockedFetchVerification.mockResolvedValue(
      makeVerification({
        verification: {
          isOriginal: false,
          confidence: 0.874,
          flags: ["Similar to an existing resource"],
          checkedAt: "2025-07-20T10:00:00.000Z",
        },
      })
    );
    const screen = renderScreen();

    await screen.findByText(resource.title);
    fireEvent.press(screen.getByLabelText("Verification"));

    expect(await screen.findByLabelText("Verification Status: verified")).toBeTruthy();
    expect(screen.getByText("Possible copy")).toBeTruthy();
    expect(screen.getByText("87%")).toBeTruthy();
    expect(screen.getByText("• Similar to an existing resource")).toBeTruthy();
    expect(screen.getByText("Checked")).toBeTruthy();
    expect(screen.getByText(/Jul.*2025/)).toBeTruthy();
  });

  it("says so when no AI check has run yet", async () => {
    mockedFetchResource.mockResolvedValue(resource);
    mockedFetchVerification.mockResolvedValue(
      makeVerification({ status: "pending", verification: null })
    );
    const screen = renderScreen();

    await screen.findByText(resource.title);
    fireEvent.press(screen.getByLabelText("Verification"));

    expect(await screen.findByLabelText("Verification Status: pending")).toBeTruthy();
    expect(screen.getByText("No AI check has run for this resource yet.")).toBeTruthy();
  });

  it("only fetches verification once the section is first expanded", async () => {
    mockedFetchResource.mockResolvedValue(resource);
    const screen = renderScreen();

    await screen.findByText(resource.title);
    expect(mockedFetchVerification).not.toHaveBeenCalled();

    fireEvent.press(screen.getByLabelText("Verification"));
    await screen.findByLabelText("Verification Status: verified");
    fireEvent.press(screen.getByLabelText("Verification"));
    fireEvent.press(screen.getByLabelText("Verification"));

    expect(mockedFetchVerification).toHaveBeenCalledTimes(1);
  });

  it("shows error state with retry button and retries successfully", async () => {
    mockedFetchResource.mockResolvedValue(resource);
    mockedFetchVerification
      .mockRejectedValueOnce(new Error("Unable to reach verification service"))
      .mockResolvedValueOnce(makeVerification());
    const screen = renderScreen();

    await screen.findByText(resource.title);
    fireEvent.press(screen.getByLabelText("Verification"));

    expect(await screen.findByText("Unable to reach verification service")).toBeTruthy();
    const retryBtn = screen.getByLabelText("Retry loading verification");
    fireEvent.press(retryBtn);

    expect(await screen.findByLabelText("Verification Status: verified")).toBeTruthy();
    expect(mockedFetchVerification).toHaveBeenCalledTimes(2);
  });
});

