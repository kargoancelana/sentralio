import { render, screen } from '@testing-library/react';
import { ProgressBar } from '../ProgressBar';

describe('ProgressBar', () => {
  it('should render with basic props', () => {
    render(<ProgressBar value={50} />);
    
    // Check if progress bar container exists
    const container = screen.getByRole('progressbar', { hidden: true });
    expect(container).toBeInTheDocument();
  });

  it('should show percentage when showPercentage is true', () => {
    render(<ProgressBar value={75} showPercentage />);
    
    expect(screen.getByText('75%')).toBeInTheDocument();
  });

  it('should show counts when showCounts is true', () => {
    render(
      <ProgressBar 
        value={3} 
        max={5} 
        showCounts 
        current={3} 
        total={5} 
      />
    );
    
    expect(screen.getByText('3 / 5')).toBeInTheDocument();
  });

  it('should show label when provided', () => {
    render(<ProgressBar value={25} label="Processing orders" />);
    
    expect(screen.getByText('Processing orders')).toBeInTheDocument();
  });

  it('should handle edge cases correctly', () => {
    // Test 0% progress
    render(<ProgressBar value={0} showPercentage />);
    expect(screen.getByText('0%')).toBeInTheDocument();

    // Test 100% progress
    render(<ProgressBar value={100} showPercentage />);
    expect(screen.getByText('100%')).toBeInTheDocument();

    // Test over 100% (should cap at 100%)
    render(<ProgressBar value={150} showPercentage />);
    expect(screen.getByText('100%')).toBeInTheDocument();
  });
});