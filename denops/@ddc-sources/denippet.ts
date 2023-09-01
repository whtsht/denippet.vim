import {
  BaseSource,
  DdcGatherItems,
  Item,
  Previewer,
} from "https://deno.land/x/ddc_vim@v4.0.4/types.ts";
import {
  GatherArguments,
  GetPreviewerArguments,
  OnCompleteDoneArguments,
} from "https://deno.land/x/ddc_vim@v4.0.4/base/source.ts";
import { Denops, op } from "../denippet/deps.ts";

type Params = Record<PropertyKey, never>;

type UserData = {
  denippet: {
    body: string;
  };
};

export class Source extends BaseSource<Params> {
  async gather({
    denops,
  }: GatherArguments<Params>): Promise<DdcGatherItems> {
    return await denops.call(
      "denippet#get_complete_items",
    ) as Item<UserData>[];
  }

  async onCompleteDone({
    denops,
  }: OnCompleteDoneArguments<Params, UserData>): Promise<void> {
    // Not expanded if confirmed with additional input.
    const itemWord = await denops.eval(`v:completed_item.word`) as string;
    const beforeLine = await denops.eval(
      `getline('.')[:col('.')-2]`,
    ) as string;
    if (!beforeLine.endsWith(itemWord)) {
      return;
    }

    await denops.call("denippet#expand");
    await denops.call("ddc#skip_next_complete");
  }

  async getPreviewer({
    denops,
    item,
  }: GetPreviewerArguments<Params, UserData>): Promise<Previewer> {
    const userData = item.user_data;
    if (userData === undefined) {
      return { kind: "empty" };
    }
    const contents = await this.snippetToString(denops, userData.denippet.body)
      .then((body) => body.replaceAll(/\r\n?/g, "\n").split("\n"));
    const filetype = await op.filetype.get(denops);
    contents.unshift("```" + filetype);
    contents.push("```");
    return { kind: "markdown", contents };
  }

  async snippetToString(
    denops: Denops,
    body: string,
  ): Promise<string> {
    return await denops.call(
      "denippet#to_string",
      body,
    ) as string;
  }

  params(): Params {
    return {};
  }
}