import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useRef, useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

interface SearchResult {
  items: string[];
}

const searchSelectedApiMock = vi.fn(
  ({ query, signal }: { api: string; query: string; signal: AbortSignal }): Promise<SearchResult> =>
    Promise.resolve({ items: [`${query}:${signal.aborted}`] }),
);

function SearchQueryHarness() {
  const [query, setQuery] = useState('initial');
  const lastSuccessfulData = useRef<SearchResult | undefined>(undefined);
  const searchQuery = useQuery<SearchResult, Error>({
    queryKey: ['plugin-search', 'Modrinth', query, 'server-1', 'Paper', '1.21.4'] as const,
    queryFn: ({ signal }) => searchSelectedApiMock({ api: 'Modrinth', query, signal }),
    retry: 1,
    retryDelay: 0,
    placeholderData: (previous: SearchResult | undefined) => previous,
  });

  const data = searchQuery.data ?? lastSuccessfulData.current;
  if (searchQuery.data && !searchQuery.isError) {
    lastSuccessfulData.current = searchQuery.data;
  }

  return (
    <div>
      <div data-testid="fetching-state">{searchQuery.isFetching ? 'fetching' : 'idle'}</div>
      <button type="button" onClick={() => setQuery('next')}>
        Search next
      </button>
      {searchQuery.isError ? (
        <div role="alert">
          <span>{searchQuery.error instanceof Error ? searchQuery.error.message : 'Error'}</span>
          <button type="button" onClick={() => void searchQuery.refetch()}>
            Retry search
          </button>
        </div>
      ) : null}
      <ul>
        {(data?.items ?? []).map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function renderHarness() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <SearchQueryHarness />
    </QueryClientProvider>,
  );
}

describe('plugin search query behavior', () => {
  beforeEach(() => {
    searchSelectedApiMock.mockReset();
  });

  it('passes AbortSignal to the selected API, retries once, clears fetching, and supports retry', async () => {
    searchSelectedApiMock
      .mockRejectedValueOnce(new Error('Modrinth unavailable'))
      .mockRejectedValueOnce(new Error('Modrinth unavailable'));

    renderHarness();

    expect(await screen.findByRole('alert')).toHaveTextContent('Modrinth unavailable');
    expect(searchSelectedApiMock).toHaveBeenCalledTimes(2);
    expect(searchSelectedApiMock.mock.calls[0][0]).toMatchObject({
      api: 'Modrinth',
      query: 'initial',
    });
    expect(searchSelectedApiMock.mock.calls[0][0].signal).toBeInstanceOf(AbortSignal);
    expect(screen.getByTestId('fetching-state')).toHaveTextContent('idle');

    searchSelectedApiMock.mockResolvedValueOnce({ items: ['WorldEdit'] });
    fireEvent.click(screen.getByRole('button', { name: /retry search/i }));

    expect(await screen.findByText('WorldEdit')).toBeInTheDocument();
    expect(searchSelectedApiMock).toHaveBeenCalledTimes(3);
  });

  it('keeps previous results visible when a later search fails', async () => {
    searchSelectedApiMock.mockResolvedValueOnce({ items: ['LuckPerms'] });

    renderHarness();

    expect(await screen.findByText('LuckPerms')).toBeInTheDocument();

    searchSelectedApiMock
      .mockRejectedValueOnce(new Error('Request timed out after 15s'))
      .mockRejectedValueOnce(new Error('Request timed out after 15s'));
    fireEvent.click(screen.getByRole('button', { name: /search next/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Request timed out after 15s');
    });
    expect(screen.getByTestId('fetching-state')).toHaveTextContent('idle');
    expect(screen.getByText('LuckPerms')).toBeInTheDocument();
  });
});
