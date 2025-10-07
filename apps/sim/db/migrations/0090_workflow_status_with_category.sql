-- Create workflow_status table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.workflow_status (
	id text NOT NULL,
	user_id text NOT NULL,
	owner_id text NOT NULL,
	workflow_id text NOT NULL,
	status text NOT NULL,
	"name" text NOT NULL,
	"comments" text NULL,
	created_at timestamp NOT NULL,
	updated_at timestamp NOT NULL,
	mapped_workflow_id text NOT NULL,
	category text DEFAULT 'marketing',
	CONSTRAINT workflow_status_pkey PRIMARY KEY (id)
);

-- Add category column if it doesn't exist
DO $$ 
BEGIN
    -- Check if category column exists, if not add it
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'workflow_status' 
        AND column_name = 'category'
        AND table_schema = 'public'
    ) THEN
        ALTER TABLE public.workflow_status 
        ADD COLUMN category text DEFAULT 'marketing';
    END IF;
END $$;

-- Add foreign key constraints if they don't exist
DO $$ 
BEGIN
    -- Add foreign key constraint for user_id if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'workflow_status_user_id_user_id_fk'
        AND table_name = 'workflow_status'
    ) THEN
        ALTER TABLE public.workflow_status 
        ADD CONSTRAINT workflow_status_user_id_user_id_fk 
        FOREIGN KEY (user_id) REFERENCES public.user(id) ON DELETE cascade ON UPDATE no action;
    END IF;

    -- Add foreign key constraint for owner_id if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'workflow_status_owner_id_user_id_fk'
        AND table_name = 'workflow_status'
    ) THEN
        ALTER TABLE public.workflow_status 
        ADD CONSTRAINT workflow_status_owner_id_user_id_fk 
        FOREIGN KEY (owner_id) REFERENCES public.user(id) ON DELETE cascade ON UPDATE no action;
    END IF;
END $$;
