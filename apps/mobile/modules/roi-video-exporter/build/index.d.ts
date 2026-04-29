declare const AdvanceSeedsRoiVideoExporter: {
  exportWithRoiAsync(inputUri: string, roi: Record<string, unknown>): Promise<string>;
};

export = AdvanceSeedsRoiVideoExporter;
