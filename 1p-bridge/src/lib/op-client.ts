import { OnePasswordConnect } from "@1password/connect";

export interface OpClientConfig {
  url: string;
  token: string;
}

export interface VaultRef {
  id: string;
  name: string;
}

export interface ItemRef {
  id: string;
  title: string;
}

interface SdkItemField {
  id?: string;
  label?: string;
  value?: string;
}

interface SdkItem {
  id?: string;
  title?: string;
  fields?: SdkItemField[];
}

export class OpClient {
  private readonly sdk: ReturnType<typeof OnePasswordConnect>;

  constructor(config: OpClientConfig) {
    this.sdk = OnePasswordConnect({
      serverURL: config.url,
      token: config.token,
      keepAlive: true,
    });
  }

  async listVaults(): Promise<VaultRef[]> {
    const vaults = await this.sdk.listVaults();
    return vaults.map((v) => ({ id: v.id ?? "", name: v.name ?? "" }));
  }

  async listItems(vault: string): Promise<ItemRef[]> {
    const items = (await this.sdk.listItems(vault)) as SdkItem[];
    return items.map((i) => ({
      id: i.id ?? "",
      title: i.title ?? "",
    }));
  }

  async getField(
    vault: string,
    item: string,
    field: string,
  ): Promise<string> {
    const fullItem = (await this.sdk.getItemByTitle(vault, item)) as SdkItem;
    const found = fullItem.fields?.find(
      (f) =>
        f.label?.toLowerCase() === field.toLowerCase() ||
        f.id?.toLowerCase() === field.toLowerCase(),
    );
    if (!found || !found.value) {
      throw new Error(
        `field '${field}' not found or empty in ${vault}/${item}`,
      );
    }
    return found.value;
  }

  async getOtp(vault: string, item: string): Promise<string> {
    return await this.sdk.getItemOTP(vault, item);
  }
}
