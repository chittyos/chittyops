export interface DriftAlert {
  tenant: "ws1" | "ws2";
  expected_hash: string;
  observed_hash: string;
  detected_at: string;
}
