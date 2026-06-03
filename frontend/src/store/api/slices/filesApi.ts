import { medicaApi } from "../baseApi";

/** `/api/files` proxy endpoints */
export const filesApi = medicaApi.injectEndpoints({
  endpoints: (build) => ({
    getFileView: build.query<Blob, string>({
      query: (fileId) => ({
        url: `files/${fileId}/view`,
        responseHandler: (response) => response.blob(),
      }),
    }),
    getFileDownload: build.query<Blob, string>({
      query: (fileId) => ({
        url: `files/${fileId}/download`,
        responseHandler: (response) => response.blob(),
      }),
    }),
  }),
});

export const {
  useGetFileViewQuery,
  useLazyGetFileViewQuery,
  useGetFileDownloadQuery,
  useLazyGetFileDownloadQuery,
} = filesApi;

